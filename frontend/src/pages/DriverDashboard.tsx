import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import BottomNav from '@/components/BottomNav';
import LocationPermission from '@/components/LocationPermission';
import { api } from '@/lib/api';
import { toTelHref } from '@/lib/phone';
import OrderChatPanel from '@/components/OrderChatPanel';
import DeliveryDoorVerifyPanel from '@/components/DeliveryDoorVerifyPanel';
import { useDriverDeliveryGps } from '@/hooks/useDriverDeliveryGps';
import { useResolvedDeviceCoords } from '@/hooks/useResolvedDeviceCoords';
import socket from '@/socket';
import {
  MapPin,
  Package,
  Truck,
  Bell,
  LogOut,
  Map,
  Bike,
  FileText,
  Radio,
  Navigation,
  ExternalLink,
  Store,
  MessageCircle,
  Phone,
  QrCode,
} from 'lucide-react';
import { toast } from 'sonner';

const DRIVER_ROUTE = ['driver_assigned', 'picked_up', 'in_transit', 'arrived'] as const;

interface DriverOffer {
  id: number;
  order_id: number;
  status: string;
  expires_at: string;
  brand: string;
  size: string;
  quantity: number;
  delivery_fee: number;
  supplier_name: string;
  pickup_city?: string;
  pickup_area?: string;
}

interface OrderRow {
  id: number;
  status: string;
  brand: string;
  size: string;
  price: string | number;
  customer_name?: string;
  customer_id?: number;
  supplier_id?: number | null;
  supplier_name?: string;
  customer_lat?: number | null;
  customer_lng?: number | null;
  delivery_id: number | null;
  driver_id?: number | null;
  delivery_user_id?: number | null;
  customer_phone?: string | null;
  supplier_phone?: string | null;
}

interface OrderDetail extends OrderRow {
  supplier_lat?: number | null;
  supplier_lng?: number | null;
}

const DriverDashboard = () => {
  const { user, resetUser } = useAppStore();
  const [tab, setTab] = useState('home');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [offers, setOffers] = useState<DriverOffer[]>([]);
  const [online, setOnline] = useState(false);
  const [trackingOrder, setTrackingOrder] = useState<OrderRow | null>(null);
  const [chatOpen, setChatOpen] = useState<{
    orderId: number;
    peerId: number;
    label: string;
    readOnly: boolean;
  } | null>(null);
  const [verifyOrderId, setVerifyOrderId] = useState<number | null>(null);
  const [routeDetailById, setRouteDetailById] = useState<Record<number, OrderDetail>>({});

  const uid = user.userId;

  const gpsActive = tab === 'home' && !!uid && online;
  const broadcastOrderId = trackingOrder?.id ?? null;

  const { lat: seedLat, lng: seedLng, deviceGeo } = useResolvedDeviceCoords();
  const gpsGate =
    deviceGeo.status === 'denied' ? 'denied' : deviceGeo.status === 'unavailable' ? 'unsupported' : 'ok';

  const { devicePos, permission } = useDriverDeliveryGps({
    active: gpsActive,
    userId: uid,
    broadcastOrderId,
    gpsGate,
    initialLat: seedLat,
    initialLng: seedLng,
  });

  const loadOrders = useCallback(async () => {
    if (!uid) return;
    try {
      const { data } = await api.get<OrderRow[]>('/orders', { params: { role: 'delivery_guy', userId: uid } });
      setOrders(data);
    } catch {
      toast.error('Could not load deliveries');
    }
  }, [uid]);

  const loadOffers = useCallback(async () => {
    if (!uid) return;
    try {
      const { data } = await api.get<{ offers: DriverOffer[] }>('/workflow/driver-offers');
      setOffers(data.offers);
    } catch {
      toast.error('Could not load delivery offers');
    }
  }, [uid]);

  useEffect(() => {
    loadOrders();
    loadOffers();
  }, [loadOrders, loadOffers, tab]);

  useEffect(() => {
    if (!uid) return;
    api.get<{ online: boolean }>('/workflow/driver/availability')
      .then(({ data }) => setOnline(Boolean(data.online)))
      .catch(() => setOnline(false));
  }, [uid]);

  useEffect(() => {
    const openNotificationOrder = async (event: Event) => {
      const orderId = Number((event as CustomEvent<{ orderId?: number }>).detail?.orderId);
      if (!Number.isFinite(orderId)) return;
      try {
        const { data } = await api.get<OrderRow>(`/orders/${orderId}`);
        setTab('home');
        if (['driver_assigned', 'picked_up', 'in_transit', 'arrived'].includes(data.status)) {
          setTrackingOrder(data);
        }
      } catch {
        toast.error('This order is no longer available to this account.');
      }
    };
    window.addEventListener('cgd:open-order', openNotificationOrder);
    return () => window.removeEventListener('cgd:open-order', openNotificationOrder);
  }, []);

  // Bell + toast when our delivery is confirmed at the door.
  useEffect(() => {
    if (!uid) return;
    socket.emit('join', uid);
    const onConfirmed = (p: { orderId?: number }) => {
      toast.success(
        p?.orderId ? `Delivery confirmed for Order #${p.orderId}` : 'Delivery confirmed'
      );
      void import('@/lib/playSellerBell').then(({ playSellerBell }) => playSellerBell(2));
      loadOrders();
    };
    const onNotification = () => {
      loadOffers();
      loadOrders();
    };
    socket.on('deliveryConfirmed', onConfirmed);
    socket.on('notification', onNotification);
    return () => {
      socket.off('deliveryConfirmed', onConfirmed);
      socket.off('notification', onNotification);
    };
  }, [uid, loadOrders, loadOffers]);

  const fetchRouteDetail = useCallback(async (orderId: number) => {
    try {
      const { data } = await api.get<OrderDetail>(`/orders/${orderId}`);
      setRouteDetailById((prev) => ({ ...prev, [orderId]: data }));
      return data;
    } catch {
      toast.error('Could not load route');
      return null;
    }
  }, []);

  const googleDirUrl = (o: OrderDetail) => {
    const clat = o.customer_lat != null ? Number(o.customer_lat) : NaN;
    const clng = o.customer_lng != null ? Number(o.customer_lng) : NaN;
    const slat = o.supplier_lat != null ? Number(o.supplier_lat) : NaN;
    const slng = o.supplier_lng != null ? Number(o.supplier_lng) : NaN;
    if (!Number.isFinite(clat) || !Number.isFinite(clng)) return null;
    const dest = `${clat},${clng}`;
    if (Number.isFinite(slat) && Number.isFinite(slng)) {
      return `https://www.google.com/maps/dir/?api=1&origin=${slat},${slng}&destination=${encodeURIComponent(dest)}&travelmode=driving`;
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
  };

  const mine = useMemo(
    () =>
      orders.filter(
        (o) => o.delivery_user_id != null && Number(o.delivery_user_id) === Number(uid)
      ),
    [orders, uid]
  );

  const earningsToday = useMemo(() => {
    return mine
      .filter((o) => o.status === 'delivered')
      .reduce((s, o) => s + Number(o.price || 0), 0);
  }, [mine]);

  const setAvailability = async (nextOnline: boolean) => {
    if (nextOnline && devicePos == null && (seedLat == null || seedLng == null)) {
      toast.error('Allow location or set a valid manual location before going online');
      return;
    }
    try {
      const position = devicePos ?? { lat: seedLat!, lng: seedLng! };
      await api.put('/workflow/driver/availability', {
        online: nextOnline,
        latitude: position.lat,
        longitude: position.lng,
      });
      setOnline(nextOnline);
      toast.success(nextOnline ? 'You are online for delivery offers' : 'You are offline');
      if (nextOnline) loadOffers();
    } catch (error: unknown) {
      const message = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      toast.error(message || 'Could not update availability');
    }
  };

  const respondToOffer = async (offerId: number, accept: boolean) => {
    try {
      await api.post(`/workflow/driver-offers/${offerId}/respond`, { accept });
      toast.success(accept ? 'Offer accepted and delivery assigned' : 'Offer declined');
      await Promise.all([loadOffers(), loadOrders()]);
    } catch (error: unknown) {
      const message = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      toast.error(message || 'Could not answer the offer');
    }
  };

  const advanceDelivery = async (order: OrderRow, status: 'picked_up' | 'in_transit' | 'arrived') => {
    try {
      await api.post(`/workflow/orders/${order.id}/delivery-state`, { status });
      if (status === 'in_transit') setTrackingOrder({ ...order, status });
      toast.success(
        status === 'picked_up'
          ? 'Pickup confirmed'
          : status === 'in_transit'
            ? 'Delivery started; live tracking is active'
            : 'Customer notified of arrival'
      );
      loadOrders();
    } catch (error: unknown) {
      const message = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      toast.error(message || 'Could not update the delivery state');
    }
  };

  const mapEmbedSrc =
    devicePos != null
      ? `https://www.google.com/maps?q=${devicePos.lat},${devicePos.lng}&z=15&output=embed`
      : null;

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-20">
      {/* Location Permission - Auto-request GPS access like Bolt */}
      <LocationPermission 
        autoRequest={false}
        showUI={true}
        onLocationGranted={(location) => {
          console.log('Driver location granted:', location);
          loadOrders();
        }}
        onLocationDenied={(error) => {
          console.error('Driver location denied:', error);
        }}
      />

      {tab === 'home' && (
        <div className="animate-fade-in">
          <div className="bg-gradient-to-br from-primary to-orange-600 px-4 sm:px-6 pt-8 md:pt-10 pb-8 rounded-b-3xl">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-orange-100 text-sm">On duty</p>
                <h1 className="text-lg md:text-xl font-bold text-card">{user.fullName || 'Driver'}</h1>
              </div>
              <div className="w-10 h-10 rounded-full bg-card/20 overflow-hidden shrink-0">
                {user.profileImage ? (
                  <img src={user.profileImage} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-card font-bold">
                    {(user.fullName || 'D')[0]}
                  </div>
                )}
              </div>
            </div>
            <p className="text-orange-100 text-xs flex items-center gap-1">
              <MapPin size={12} /> {user.city || 'Not set'}, {user.area || user.country}
            </p>
            {user.plateNumber && (
              <p className="text-orange-100 text-xs flex items-center gap-1 mt-1">
                <Bike size={12} /> Plate: {user.plateNumber}
              </p>
            )}
          </div>

          <div className="px-4 sm:px-6 -mt-4 space-y-6">
            <div className="bg-card rounded-2xl p-4 border border-border shadow-sm flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">Delivery availability</p>
                <p className="text-xs text-muted-foreground">
                  {online ? 'Online · receiving eligible nearby offers' : 'Offline · GPS updates are stopped'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void setAvailability(!online)}
                className={`px-4 py-2 rounded-full text-sm font-semibold ${online ? 'bg-green-600 text-white' : 'bg-muted text-foreground'}`}
              >
                {online ? 'Go offline' : 'Go online'}
              </button>
            </div>
            {permission === 'unsupported' && (
              <div className="rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
                Live GPS isn’t available on this device. You can still manage jobs; position updates require a
                GPS-capable browser.
              </div>
            )}
            {permission === 'denied' && (
              <div className="rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
                Location was blocked or declined, so live tracking is unavailable. Allow location in browser settings,
                then use the location button again. CGD will not bypass your device permission.
              </div>
            )}

            <div className="bg-card rounded-2xl p-4 border border-border shadow-sm animate-scale-in">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gas-light-orange rounded-full flex items-center justify-center shrink-0">
                  <span className="text-primary font-bold text-sm">TSH</span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Completed deliveries (value)</p>
                  <p className="text-2xl font-bold text-foreground">{earningsToday.toFixed(0)}</p>
                </div>
              </div>
            </div>

            {broadcastOrderId && permission === 'granted' && (
              <div className="rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950/30 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Radio size={18} className="text-orange-600 animate-pulse" />
                  Live GPS → order #{broadcastOrderId} (updates every few seconds)
                </div>
                <button
                  type="button"
                  onClick={() => setTrackingOrder(null)}
                  className="text-xs text-muted-foreground underline"
                >
                  Stop sharing to server
                </button>
              </div>
            )}

            <div>
              <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                <Map size={16} /> Your position (live GPS)
              </h3>
              <div className="rounded-2xl overflow-hidden border border-border h-48 md:h-56 bg-muted flex items-center justify-center">
                {mapEmbedSrc ? (
                  <iframe
                    src={mapEmbedSrc}
                    className="w-full h-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title="Your live location"
                  />
                ) : (
                  <div className="text-center px-6 py-8 text-sm text-muted-foreground flex flex-col items-center gap-2">
                    <Navigation className="opacity-50" size={28} />
                    {permission === 'unknown' ? (
                      <span>Waiting for position…</span>
                    ) : (
                      <span>Map position not available.</span>
                    )}
                  </div>
                )}
              </div>
              {devicePos && (
                <p className="text-xs text-muted-foreground mt-2 font-mono">
                  {devicePos.lat.toFixed(5)}, {devicePos.lng.toFixed(5)}
                </p>
              )}
            </div>

            <div>
              <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                <Package size={16} /> Delivery offers
              </h3>
              {offers.filter((offer) => offer.status === 'pending').length === 0 ? (
                <div className="bg-card rounded-xl p-6 border border-border text-center">
                  <Package size={32} className="mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No active offers. Go online to receive nearby jobs.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {offers.filter((offer) => offer.status === 'pending').map((o) => (
                    <div key={o.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                      <p className="font-medium text-foreground">
                        #{o.order_id} · {o.brand}{' '}
                        {String(o.size).includes('kg') ? o.size : `${o.size} kg`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Pickup: {o.supplier_name}{o.pickup_area ? ` · ${o.pickup_area}` : ''} · Delivery TSh {Number(o.delivery_fee || 0).toLocaleString()}
                      </p>
                      <button
                        type="button"
                        onClick={() => void respondToOffer(o.id, true)}
                        className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
                      >
                        Accept offer
                      </button>
                      <button
                        type="button"
                        onClick={() => void respondToOffer(o.id, false)}
                        className="w-full py-2 rounded-lg border border-border text-sm font-semibold"
                      >
                        Decline offer
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                <Truck size={16} /> My active deliveries
              </h3>
              {mine.filter((o) => !['completed', 'cancelled', 'delivered'].includes(o.status)).length === 0 ? (
                <div className="bg-card rounded-xl p-6 border border-border text-center">
                  <Truck size={32} className="mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No active deliveries</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {mine
                    .filter((o) => !['completed', 'cancelled', 'delivered'].includes(o.status))
                    .map((o) => (
                      <div key={o.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="font-medium text-foreground">#{o.id}</span>
                          <span className="text-xs uppercase bg-muted px-2 py-0.5 rounded-full">{o.status}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Customer: {o.customer_name}</p>
                        {o.customer_lat != null && o.customer_lng != null && (
                          <p className="text-[11px] text-muted-foreground font-mono">
                            Drop-off: {Number(o.customer_lat).toFixed(4)}, {Number(o.customer_lng).toFixed(4)}
                          </p>
                        )}
                        <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                          {DRIVER_ROUTE.includes(o.status as (typeof DRIVER_ROUTE)[number]) && o.customer_id != null && (
                            <button
                              type="button"
                              onClick={() =>
                                setChatOpen({
                                  orderId: o.id,
                                  peerId: o.customer_id!,
                                  label: `Chat · ${o.customer_name || 'Customer'}`,
                                  readOnly: false,
                                })
                              }
                              className="flex-1 min-w-[140px] py-2 rounded-lg border border-border text-sm font-medium inline-flex items-center justify-center gap-1"
                            >
                              <MessageCircle size={14} /> Chat customer
                            </button>
                          )}
                          {DRIVER_ROUTE.includes(o.status as (typeof DRIVER_ROUTE)[number]) &&
                            o.supplier_id != null &&
                            Number(o.supplier_id) > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setChatOpen({
                                    orderId: o.id,
                                    peerId: Number(o.supplier_id),
                                    label: `Chat · ${o.supplier_name || 'Supplier'}`,
                                    readOnly: false,
                                  })
                                }
                                className="flex-1 min-w-[140px] py-2 rounded-lg border border-border text-sm font-medium inline-flex items-center justify-center gap-1"
                              >
                                <MessageCircle size={14} /> Chat supplier
                              </button>
                            )}
                          {DRIVER_ROUTE.includes(o.status as (typeof DRIVER_ROUTE)[number]) && toTelHref(o.customer_phone) && (
                            <a
                              href={toTelHref(o.customer_phone)}
                              className="flex-1 min-w-[140px] py-2 rounded-lg bg-green-600 text-white text-sm font-medium inline-flex items-center justify-center gap-1"
                            >
                              <Phone size={14} /> Call customer
                            </a>
                          )}
                          {DRIVER_ROUTE.includes(o.status as (typeof DRIVER_ROUTE)[number]) && toTelHref(o.supplier_phone) && (
                            <a
                              href={toTelHref(o.supplier_phone)}
                              className="flex-1 min-w-[140px] py-2 rounded-lg bg-green-600 text-white text-sm font-medium inline-flex items-center justify-center gap-1"
                            >
                              <Phone size={14} /> Call supplier
                            </a>
                          )}
                          {DRIVER_ROUTE.includes(o.status as (typeof DRIVER_ROUTE)[number]) && (
                            <button
                              type="button"
                              onClick={async () => {
                                await fetchRouteDetail(o.id);
                              }}
                              className="flex-1 min-w-[140px] py-2 rounded-lg border border-border text-sm font-medium inline-flex items-center justify-center gap-1"
                            >
                              <Store size={14} /> Load shop → customer route
                            </button>
                          )}
                          {routeDetailById[o.id] && googleDirUrl(routeDetailById[o.id]) && (
                            <a
                              href={googleDirUrl(routeDetailById[o.id])!}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 min-w-[140px] py-2 rounded-lg bg-blue-600 text-white text-sm font-medium inline-flex items-center justify-center gap-1"
                            >
                              <ExternalLink size={14} /> Google Maps route
                            </a>
                          )}
                          {o.status === 'driver_assigned' && (
                            <button
                              type="button"
                              onClick={() => void advanceDelivery(o, 'picked_up')}
                              className="flex-1 min-w-[140px] py-2 rounded-lg bg-slate-700 text-white text-sm font-medium"
                            >
                              Confirm pickup at shop
                            </button>
                          )}
                          {o.status === 'picked_up' && (
                            <button
                              type="button"
                              onClick={() => void advanceDelivery(o, 'in_transit')}
                              className="flex-1 min-w-[140px] py-2 rounded-lg bg-orange-600 text-white text-sm font-medium"
                            >
                              Start delivery to customer
                            </button>
                          )}
                          {DRIVER_ROUTE.includes(o.status as (typeof DRIVER_ROUTE)[number]) && (
                            <button
                              type="button"
                              onClick={() => {
                                setTrackingOrder(o);
                                toast.success('Sharing live GPS to this order');
                              }}
                              className="flex-1 min-w-[140px] py-2 rounded-lg border border-border text-sm font-medium"
                            >
                              {o.status === 'in_transit' ? 'Re-link GPS to order' : 'Share live GPS'}
                            </button>
                          )}
                          {o.status === 'in_transit' && (
                            <button
                              type="button"
                              onClick={() => void advanceDelivery(o, 'arrived')}
                              className="flex-1 min-w-[140px] py-2 rounded-lg bg-violet-600 text-white text-sm font-medium"
                            >
                              Arrived at customer
                            </button>
                          )}
                          {o.status === 'arrived' && (
                            <button
                              type="button"
                              onClick={() => setVerifyOrderId(o.id)}
                              className="flex-1 min-w-[160px] py-2 rounded-lg bg-green-600 text-white text-sm font-medium inline-flex items-center justify-center gap-1.5"
                            >
                              <QrCode size={14} /> Verify QR / code & release
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'orders' && (
        <div className="px-4 sm:px-6 pt-8 md:pt-10 animate-fade-in space-y-3">
          <h1 className="text-xl font-bold text-foreground mb-4">Delivery history</h1>
          {mine.length === 0 ? (
            <div className="bg-card rounded-xl p-6 border border-border text-center">
              <Truck size={32} className="mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No deliveries yet</p>
            </div>
          ) : (
            mine.map((o) => (
              <div key={o.id} className="rounded-xl border border-border bg-card p-4 flex flex-wrap justify-between gap-2">
                <span className="font-medium text-foreground">
                  #{o.id} · {o.brand}
                </span>
                <span className="text-xs uppercase bg-muted px-2 py-0.5 rounded-full">{o.status}</span>
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
            <p className="text-sm text-muted-foreground">Check Home for new orders ready for pickup.</p>
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
                  {(user.fullName || 'D')[0]}
                </div>
              )}
            </div>
            <h2 className="text-lg font-bold text-foreground">{user.fullName || 'Driver'}</h2>
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
            {user.plateNumber && (
              <div className="bg-card rounded-xl p-4 border border-border">
                <div className="flex items-center gap-2">
                  <Bike size={14} className="text-primary" />
                  <p className="text-xs text-muted-foreground">Motorcycle plate</p>
                </div>
                <p className="text-sm font-medium text-foreground">{user.plateNumber}</p>
              </div>
            )}
            {user.drivingLicense && (
              <div className="bg-card rounded-xl p-4 border border-border">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-primary" />
                  <p className="text-xs text-muted-foreground">Driving license</p>
                </div>
                <p className="text-sm font-medium text-foreground">{user.drivingLicense}</p>
              </div>
            )}
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

      {verifyOrderId != null && uid != null && (
        <DeliveryDoorVerifyPanel
          open
          orderId={verifyOrderId}
          driverUserId={uid}
          onClose={() => setVerifyOrderId(null)}
          onVerified={() => {
            // Refresh after release; the bell event will pop a toast on its own.
            loadOrders();
            if (trackingOrder?.id === verifyOrderId) setTrackingOrder(null);
            setTimeout(() => setVerifyOrderId(null), 1500);
          }}
        />
      )}

      <BottomNav active={tab} onNavigate={setTab} />
    </div>
  );
};

export default DriverDashboard;

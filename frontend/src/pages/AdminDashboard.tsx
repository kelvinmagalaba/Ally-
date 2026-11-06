import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import BottomNav from '@/components/BottomNav';
import LocationPermission from '@/components/LocationPermission';
import { api } from '@/lib/api';
import { BarChart3, LogOut, Users, Package, TrendingUp, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface Stats {
  users: number;
  orders: number;
  pendingOrders: number;
  revenue: number;
}

interface AdminUserRow {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  city: string;
  created_at: string;
  approved: number | boolean;
}

interface OrderRow {
  id: number;
  status: string;
  brand: string;
  size: string;
  price: string | number;
  customer_name?: string;
  supplier_name?: string;
}

interface PricingRule {
  base_fee: number;
  rate_per_km: number;
  minimum_fee: number;
  maximum_distance_km: number;
  zone_surcharge: number;
  time_surcharge: number;
  fallback_policy: 'reject' | 'straight_line';
}

const AdminDashboard = () => {
  const { user, resetUser, setPage } = useAppStore();
  const [tab, setTab] = useState('home');
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [adminOrders, setAdminOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [pricing, setPricing] = useState<PricingRule | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, u, p] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users'),
        api.get<{ rule: PricingRule | null }>('/workflow/pricing-rule'),
      ]);
      setStats(s.data);
      setUsers(u.data);
      setPricing(p.data.rule);
      if (user.userId) {
        const o = await api.get<OrderRow[]>('/orders', {
          params: { role: 'admin', userId: user.userId },
        });
        setAdminOrders(o.data);
      }
    } catch {
      toast.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user.role === 'admin') load();
  }, [user.role, user.userId]);

  const savePricing = async () => {
    if (!pricing) return;
    try {
      await api.put('/workflow/pricing-rule', pricing);
      toast.success('A new pricing rule version is active; existing orders were not changed');
      load();
    } catch (error: unknown) {
      const message = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      toast.error(message || 'Could not save the pricing rule');
    }
  };

  const setApproval = async (account: AdminUserRow, approved: boolean) => {
    try {
      await api.patch(`/admin/users/${account.id}/approval`, { approved });
      setUsers((current) => current.map((row) => row.id === account.id ? { ...row, approved } : row));
      toast.success(`${account.role === 'supplier' ? 'Seller' : 'Driver'} ${approved ? 'approved' : 'suspended'}`);
    } catch (error: unknown) {
      const message = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      toast.error(message || 'Could not change approval');
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-20">
      {/* Location Permission - Auto-request GPS access like Bolt */}
      <LocationPermission 
        autoRequest={false}
        showUI={true}
        onLocationGranted={(location) => {
          console.log('Admin location granted:', location);
          load();
        }}
        onLocationDenied={(error) => {
          console.error('Admin location denied:', error);
        }}
      />

      {tab === 'home' && (
        <div className="animate-fade-in px-4 sm:px-6 md:px-8 pt-8 md:pt-10">
          <div className="bg-gradient-to-br from-slate-700 to-slate-900 rounded-2xl px-5 py-6 md:px-8 md:py-8 text-primary-foreground mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-slate-300 text-sm">Admin</p>
                <h1 className="text-xl md:text-2xl font-bold">{user.fullName || 'Administrator'}</h1>
              </div>
              <button
                type="button"
                onClick={() => load()}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
            <div className="rounded-2xl border border-border bg-card p-4">
              <Users className="text-slate-600 mb-2" size={20} />
              <p className="text-2xl font-bold text-foreground">{stats?.users ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Users</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <Package className="text-slate-600 mb-2" size={20} />
              <p className="text-2xl font-bold text-foreground">{stats?.orders ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Orders</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <BarChart3 className="text-slate-600 mb-2" size={20} />
              <p className="text-2xl font-bold text-foreground">{stats?.pendingOrders ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 col-span-2 lg:col-span-1">
              <TrendingUp className="text-slate-600 mb-2" size={20} />
              <p className="text-2xl font-bold text-foreground">
                {stats != null ? `TSH ${Number(stats.revenue).toFixed(0)}` : '—'}
              </p>
              <p className="text-xs text-muted-foreground">Revenue</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border font-semibold text-foreground">Recent users</div>
            <div className="max-h-[50vh] overflow-auto">
              {users.slice(0, 15).map((u) => (
                <div key={u.id} className="px-4 py-3 border-b border-border text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span className="font-medium text-foreground">{u.full_name}</span>
                  <span className="text-muted-foreground text-xs sm:text-sm">{u.email}</span>
                  <span className="text-xs uppercase text-accent">{u.role}</span>
                  {['supplier', 'driver', 'delivery_guy'].includes(u.role) && (
                    <button
                      type="button"
                      onClick={() => void setApproval(u, !u.approved)}
                      className={`rounded-lg px-2 py-1 text-xs font-medium ${u.approved ? 'bg-red-50 text-red-700' : 'bg-green-600 text-white'}`}
                    >
                      {u.approved ? 'Suspend' : 'Approve'}
                    </button>
                  )}
                </div>
              ))}
              {users.length === 0 && !loading && (
                <p className="p-6 text-center text-muted-foreground text-sm">No users yet</p>
              )}
            </div>
          </div>

          {pricing && (
            <div className="rounded-2xl border border-border bg-card p-4 mt-6 space-y-3">
              <div>
                <h2 className="font-semibold text-foreground">Delivery pricing (TSh)</h2>
                <p className="text-xs text-muted-foreground">Backend-calculated from route kilometres. Saving creates a new audited rule version.</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {([
                  ['base_fee', 'Base fee'],
                  ['rate_per_km', 'Rate / road km'],
                  ['minimum_fee', 'Minimum fee'],
                  ['maximum_distance_km', 'Maximum distance km'],
                  ['zone_surcharge', 'Zone surcharge'],
                  ['time_surcharge', 'Time surcharge'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="text-xs text-muted-foreground">
                    {label}
                    <input
                      type="number"
                      min={0}
                      value={pricing[key]}
                      onChange={(event) => setPricing({ ...pricing, [key]: Number(event.target.value) })}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                ))}
              </div>
              <label className="text-xs text-muted-foreground block">
                Route failure policy
                <select
                  value={pricing.fallback_policy}
                  onChange={(event) => setPricing({ ...pricing, fallback_policy: event.target.value as PricingRule['fallback_policy'] })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="reject">Require real routing; ask customer to retry</option>
                  <option value="straight_line">Disclosed straight-line fallback</option>
                </select>
              </label>
              <button type="button" onClick={() => void savePricing()} className="w-full rounded-xl bg-slate-800 text-white py-2.5 text-sm font-semibold">
                Save new pricing version
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'orders' && (
        <div className="px-4 sm:px-6 pt-10 animate-fade-in space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-bold text-foreground">All orders</h1>
            <button
              type="button"
              onClick={() => load()}
              className="text-sm text-blue-600 font-medium"
            >
              Refresh
            </button>
          </div>
          {adminOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders loaded.</p>
          ) : (
            adminOrders.slice(0, 50).map((o) => (
              <div key={o.id} className="rounded-xl border border-border bg-card p-4 flex flex-wrap justify-between gap-2">
                <span className="font-medium text-foreground">
                  #{o.id} · {o.brand}{' '}
                  {String(o.size).includes('kg') ? o.size : `${o.size} kg`}
                </span>
                <span className="text-xs uppercase bg-muted px-2 py-0.5 rounded-full">{o.status}</span>
                <p className="w-full text-xs text-muted-foreground">
                  {o.customer_name} → {o.supplier_name || '—'}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'notifications' && (
        <div className="px-4 sm:px-6 pt-10 animate-fade-in">
          <h1 className="text-xl font-bold text-foreground mb-4">System</h1>
          <p className="text-sm text-muted-foreground">No system alerts.</p>
        </div>
      )}

      {tab === 'profile' && (
        <div className="px-4 sm:px-6 pt-10 animate-fade-in max-w-lg mx-auto">
          <button
            type="button"
            onClick={() => setPage('role-select')}
            className="w-full mb-3 py-3 rounded-xl border border-border text-sm font-medium"
          >
            Switch role (logout flow)
          </button>
          <button
            type="button"
            onClick={() => resetUser()}
            className="w-full py-3 bg-destructive/10 text-destructive rounded-xl font-medium text-sm flex items-center justify-center gap-2"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      )}

      <BottomNav active={tab} onNavigate={setTab} color="text-slate-700" />
    </div>
  );
};

export default AdminDashboard;

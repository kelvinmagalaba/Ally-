import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import {
  CheckCircle2,
  ShoppingCart,
  Store,
  Bike,
  Shield,
  ArrowRight,
} from 'lucide-react';

/**
 * Post-signup welcome screen, shown right after an account is created
 * (regardless of role). It explains in one screen what they can do now
 * and routes them into the next step of their flow.
 *
 * Wiring: AuthPage / OTP success now calls setPage('account-created').
 * From here the user taps "Continue" and we send them onward:
 *   customer  -> location
 *   supplier  -> location  (then payment-method, brand-select, prices)
 *   driver    -> location  (then driver-dashboard)
 *   admin     -> admin-dashboard
 */

const ROLE_CONFIG = {
  customer: {
    title: 'Welcome — your customer account is ready',
    blurb:
      "You can now order gas cylinders from sellers near you. We'll show them on a map and you can search by area. You can order for yourself or for a friend.",
    bullets: [
      'Browse sellers nearby on the map',
      'Pick a cylinder size and brand',
      'Pay and get a receipt with a QR code',
      'Track the delivery driver in real time',
    ],
    Icon: ShoppingCart,
    accent: 'from-blue-500 to-blue-700',
    next: 'location',
    cta: 'Set up my location',
  },
  supplier: {
    title: 'Welcome — your seller account is ready',
    blurb:
      "Customers will be able to find you on the map and place orders. Set up your location, payment methods, gas brands and prices to start receiving orders.",
    bullets: [
      'Set your shop location & payment numbers',
      'Pick the cylinder brands and sizes you sell',
      'Set a price for each size',
      'Get notified instantly when an order comes in',
    ],
    Icon: Store,
    accent: 'from-amber-500 to-orange-600',
    next: 'location',
    cta: 'Set up my shop',
  },
  driver: {
    title: 'Welcome — your delivery account is ready',
    blurb:
      "Sellers will see you on the map when an order needs delivery. Confirm your location to start receiving assignments.",
    bullets: [
      'Get assigned to nearby pickups',
      'See the seller location on the map',
      'Get the customer location after entering the seller code',
      'Confirm delivery by scanning the QR on the customer receipt',
    ],
    Icon: Bike,
    accent: 'from-emerald-500 to-emerald-700',
    next: 'location',
    cta: 'Go online',
  },
  delivery_guy: {
    title: 'Welcome — your delivery account is ready',
    blurb:
      "Sellers will see you on the map when an order needs delivery. Confirm your location to start receiving assignments.",
    bullets: [
      'Get assigned to nearby pickups',
      'See the seller location on the map',
      'Get the customer location after entering the seller code',
      'Confirm delivery by scanning the QR on the customer receipt',
    ],
    Icon: Bike,
    accent: 'from-emerald-500 to-emerald-700',
    next: 'location',
    cta: 'Go online',
  },
  admin: {
    title: 'Welcome — admin account ready',
    blurb: "You're all set. Open the admin dashboard to manage the platform.",
    bullets: ['Manage users', 'Audit transactions', 'See platform health'],
    Icon: Shield,
    accent: 'from-slate-700 to-slate-900',
    next: 'admin-dashboard',
    cta: 'Open dashboard',
  },
} as const;

const AccountCreatedPage = () => {
  const { user, setPage } = useAppStore();

  // If somehow we got here without a role, send back to role select.
  useEffect(() => {
    if (!user.role) setPage('role-select');
  }, [user.role, setPage]);

  const cfg = (user.role && ROLE_CONFIG[user.role]) || ROLE_CONFIG.customer;
  const Icon = cfg.Icon;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className={`bg-gradient-to-br ${cfg.accent} px-6 pt-12 pb-10 rounded-b-3xl`}>
        <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center mb-4">
          <CheckCircle2 className="text-white" size={32} />
        </div>
        <p className="text-white/80 text-xs uppercase tracking-wider">Account created</p>
        <h1 className="text-2xl font-bold text-white mt-1">{cfg.title}</h1>
        <p className="text-white/90 text-sm mt-2 leading-relaxed">{cfg.blurb}</p>
      </div>

      <div className="flex-1 px-6 -mt-4">
        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <Icon size={16} className="text-foreground" />
            </div>
            <p className="font-semibold text-foreground text-sm">What you can do next</p>
          </div>
          <ul className="space-y-2.5">
            {cfg.bullets.map((b) => (
              <li key={b} className="flex gap-2 text-sm text-muted-foreground">
                <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-foreground">{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {user.fullName ? (
          <p className="text-xs text-muted-foreground mt-4 px-2">
            Signed in as <span className="font-medium text-foreground">{user.fullName}</span>
            {user.phone ? <> · {user.phone}</> : null}
          </p>
        ) : null}
      </div>

      <div className="px-6 pb-8 pt-4">
        <button
          type="button"
          onClick={() => setPage(cfg.next)}
          className="w-full py-4 rounded-full bg-accent text-accent-foreground font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          {cfg.cta} <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default AccountCreatedPage;

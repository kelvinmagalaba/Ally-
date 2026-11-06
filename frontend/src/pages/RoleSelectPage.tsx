import { useAppStore } from '@/store/useAppStore';
import { Store, Truck, User } from 'lucide-react';

/** Administrator is credential-based and is never presented as a selectable role. */
const visibleRoles = [
  {
    id: 'supplier' as const,
    title: 'Seller',
    desc: 'Manage your cooking gas business',
    icon: Store,
    color: 'bg-accent text-accent-foreground',
  },
  {
    id: 'driver' as const,
    title: 'Delivery',
    desc: 'Deliver cooking gas to customers',
    icon: Truck,
    color: 'bg-primary text-primary-foreground',
  },
  {
    id: 'customer' as const,
    title: 'Customer',
    desc: 'Order cooking gas',
    icon: User,
    color: 'bg-blue-500 text-primary-foreground',
  },
];

export default function RoleSelectPage() {
  const { setUser, setPage } = useAppStore();

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-400 to-indigo-600 flex flex-col px-6 py-12">
      <div className="animate-slide-up select-none">
        <p className="text-primary-foreground/75 text-sm font-semibold mb-2">CGD — Cooking Gas Delivery</p>
        <h1 className="text-3xl font-bold text-primary-foreground mb-2">Choose Your Role</h1>
        <p className="text-primary-foreground/80 mb-10">How would you like to use CGD?</p>
      </div>

      <div className="space-y-4 flex-1">
        {visibleRoles.map((role, index) => (
          <button
            key={role.id}
            type="button"
            onClick={() => {
              setUser({ role: role.id });
              setPage('auth');
            }}
            className="w-full bg-card rounded-2xl p-5 flex items-center gap-4 shadow-lg transition-all active:scale-[0.98] hover:shadow-xl animate-slide-up"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className={`w-14 h-14 rounded-full ${role.color} flex items-center justify-center`}>
              <role.icon size={28} />
            </div>
            <div className="text-left">
              <h3 className="text-lg font-bold text-foreground">{role.title}</h3>
              <p className="text-sm text-muted-foreground">{role.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

import { Home, ShoppingBag, Bell, User } from 'lucide-react';

interface Props {
  active: string;
  onNavigate: (tab: string) => void;
  color?: string;
}

const BottomNav = ({ active, onNavigate, color = 'text-primary' }: Props) => {
  const tabs = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'orders', icon: ShoppingBag, label: 'Orders' },
    { id: 'notifications', icon: Bell, label: 'Alerts' },
    { id: 'profile', icon: User, label: 'Profile' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border safe-bottom z-50">
      <div className="flex w-full max-w-lg md:max-w-3xl lg:max-w-5xl mx-auto px-0 sm:px-4 md:px-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
            className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors ${
              active === tab.id ? color : 'text-muted-foreground'
            }`}
          >
            <tab.icon size={20} />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default BottomNav;

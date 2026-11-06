import { useAppStore } from '@/store/useAppStore';
import OnboardingPage from './OnboardingPage';
import LandingPage from './LandingPage';
import RoleSelectPage from './RoleSelectPage';
import AuthPage from './AuthPage';
import OTPVerificationPage from './OTPVerificationPage';
import AccountCreatedPage from './AccountCreatedPage';
import LocationPage from './LocationPage';
import BrandSelectPage from './BrandSelectPage';
import PriceSettingPage from './PriceSettingPage';
import SellerSetPricesPage from './SellerSetPricesPage';
import PaymentMethodPage from './PaymentMethodPage';
import SupplierDashboard from './SupplierDashboard';
import CustomerDashboard from './CustomerDashboard';
import DriverDashboard from './DriverDashboard';
import AdminDashboard from './AdminDashboard';
import SettingsPage from './SettingsPage';
import { Settings } from 'lucide-react';
import NotificationCenter from '@/components/NotificationCenter';

const pages: Record<string, React.FC> = {
  'onboarding': LandingPage,
  'onboarding-slides': OnboardingPage,
  'role-select': RoleSelectPage,
  'auth': AuthPage,
  'verify-otp': OTPVerificationPage,
  'account-created': AccountCreatedPage,
  'location': LocationPage,
  'brand-select': BrandSelectPage,
  'price-setting': PriceSettingPage,
  'seller-set-prices': SellerSetPricesPage,
  'payment-method': PaymentMethodPage,
  'supplier-dashboard': SupplierDashboard,
  'customer-dashboard': CustomerDashboard,
  'driver-dashboard': DriverDashboard,
  'admin-dashboard': AdminDashboard,
  'settings': SettingsPage,
};

const Index = () => {
  const currentPage = useAppStore((s) => s.currentPage);
  const user = useAppStore((s) => s.user);
  const setPage = useAppStore((s) => s.setPage);
  const Page = pages[currentPage] || LandingPage;

  return (
    <div className={currentPage === 'onboarding'
      ? 'w-full min-h-screen relative'
      : 'w-full max-w-lg md:max-w-3xl lg:max-w-5xl mx-auto min-h-screen relative overflow-x-hidden px-0 sm:px-4 md:px-6'}>
      {user.userId && currentPage.includes('dashboard') ? (
        <>
        <NotificationCenter
          onOpenOrder={(orderId) => {
            setPage(user.role === 'supplier' ? 'supplier-dashboard' : user.role === 'admin' ? 'admin-dashboard' : user.role === 'customer' ? 'customer-dashboard' : 'driver-dashboard');
            window.dispatchEvent(new CustomEvent('cgd:open-order', { detail: { orderId } }));
          }}
        />
        <button
          type="button"
          aria-label="Account settings"
          onClick={() => setPage('settings')}
          className="fixed right-4 top-4 z-40 rounded-full border border-border bg-card/95 p-2.5 text-foreground shadow-md backdrop-blur"
        >
          <Settings size={19} />
        </button>
        </>
      ) : null}
      <Page />
    </div>
  );
};

export default Index;

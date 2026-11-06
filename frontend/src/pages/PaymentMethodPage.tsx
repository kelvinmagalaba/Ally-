import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Check, ChevronRight, Phone, CreditCard } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

const mobileMoneyOptions = [
  { id: 'mpesa', name: 'M-Pesa (Vodacom)', icon: '📱' },
  { id: 'tigopesa', name: 'Tigo Pesa', icon: '📱' },
  { id: 'airtelmoney', name: 'Airtel Money', icon: '📱' },
  { id: 'halopesa', name: 'HaloPesa', icon: '📱' },
];

const bankOptions = [
  { id: 'crdb', name: 'CRDB Bank', icon: '🏦' },
  { id: 'nmb', name: 'NMB Bank', icon: '🏦' },
  { id: 'nbc', name: 'NBC Bank', icon: '🏦' },
  { id: 'equity', name: 'Equity Bank', icon: '🏦' },
  { id: 'absa', name: 'Absa Bank', icon: '🏦' },
];

const PaymentMethodPage = () => {
  const { user, setUser, setPage } = useAppStore();
  const [selected, setSelected] = useState<string[]>(user.paymentMethods || []);
  const [transactionPhone, setTransactionPhone] = useState(user.transactionPhone || '');

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const handleContinue = async () => {
    setUser({ paymentMethods: selected, transactionPhone });
    if (user.userId) {
      try {
        await api.put(`/auth/user/${user.userId}`, {
          paymentMethods: selected,
          transactionPhone,
        });
      } catch {
        toast.error('Could not sync payment methods to server');
      }
    }
    setPage('brand-select');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-gradient-to-br from-green-500 to-green-600 px-6 pt-10 pb-8 rounded-b-3xl">
        <h1 className="text-2xl font-bold text-card">Payment Methods</h1>
        <p className="text-green-100 text-sm mt-1">Select how customers will pay you</p>
      </div>

      <div className="flex-1 px-6 pt-6 overflow-y-auto pb-4">
        {/* Transaction Phone */}
        <div className="mb-6">
          <label className="text-sm font-semibold text-foreground mb-2 block">Transaction Phone Number</label>
          <div className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3">
            <Phone size={18} className="text-muted-foreground" />
            <input
              type="tel"
              placeholder="Phone for transactions"
              value={transactionPhone}
              onChange={(e) => setTransactionPhone(e.target.value.replace(/\D/g, ''))}
              className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Mobile Money */}
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Phone size={16} /> Mobile Money
        </h3>
        <div className="space-y-2 mb-6">
          {mobileMoneyOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => toggle(opt.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all active:scale-[0.98] ${
                selected.includes(opt.id)
                  ? 'border-accent bg-gas-light-green'
                  : 'border-border bg-card'
              }`}
            >
              <span className="text-lg">{opt.icon}</span>
              <span className="flex-1 text-left text-sm font-medium text-foreground">{opt.name}</span>
              {selected.includes(opt.id) && (
                <div className="w-5 h-5 bg-accent rounded-full flex items-center justify-center">
                  <Check size={12} className="text-accent-foreground" />
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Banks */}
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <CreditCard size={16} /> Bank Transfer
        </h3>
        <div className="space-y-2">
          {bankOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => toggle(opt.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all active:scale-[0.98] ${
                selected.includes(opt.id)
                  ? 'border-accent bg-gas-light-green'
                  : 'border-border bg-card'
              }`}
            >
              <span className="text-lg">{opt.icon}</span>
              <span className="flex-1 text-left text-sm font-medium text-foreground">{opt.name}</span>
              {selected.includes(opt.id) && (
                <div className="w-5 h-5 bg-accent rounded-full flex items-center justify-center">
                  <Check size={12} className="text-accent-foreground" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 pb-8 pt-2">
        <button
          onClick={handleContinue}
          disabled={selected.length === 0}
          className="w-full py-4 rounded-full bg-accent text-accent-foreground font-bold text-lg transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          Continue <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
};

export default PaymentMethodPage;

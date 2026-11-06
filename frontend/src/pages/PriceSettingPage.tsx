import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import cylinder3 from '@/assets/cylinder-3kg.png';
import cylinder6 from '@/assets/cylinder-6kg.png';
import cylinder12 from '@/assets/cylinder-12kg.png';
import cylinder15 from '@/assets/cylinder-15kg.png';
import cylinder25 from '@/assets/cylinder-25kg.png';
import cylinder38 from '@/assets/cylinder-38kg.png';
import cylinder45 from '@/assets/cylinder-45kg.png';

const sizes = [
  { kg: '3', img: cylinder3 },
  { kg: '6', img: cylinder6 },
  { kg: '12', img: cylinder12 },
  { kg: '15', img: cylinder15 },
  { kg: '25', img: cylinder25 },
  { kg: '38', img: cylinder38 },
  { kg: '45', img: cylinder45 },
];

const PriceSettingPage = () => {
  const { user, setUser, setPage } = useAppStore();
  const brands = user.selected_brands || [];
  const [prices, setPrices] = useState<Record<string, Record<string, number>>>(user.prices || {});
  const [saving, setSaving] = useState(false);

  const updatePrice = (brand: string, size: string, value: string) => {
    setPrices((prev) => ({
      ...prev,
      [brand]: { ...prev[brand], [size]: Number(value) || 0 },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      setUser({ prices, selected_brands: user.selected_brands });
      if (user.userId) {
        await api.put(`/auth/user/${user.userId}`, {
          prices,
          selectedBrands: user.selected_brands,
        });
      }
      toast.success('Prices saved successfully!');
      setPage('supplier-dashboard');
    } catch {
      toast.error('Could not save prices to server');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="px-6 pt-10 pb-4">
        <h1 className="text-2xl font-bold text-foreground">Set Your Prices</h1>
        <p className="text-muted-foreground text-sm">Set prices (TSh) for each cylinder size</p>
      </div>

      <div className="flex-1 px-6 overflow-y-auto pb-4 space-y-6">
        {brands.map((brand) => (
          <div key={brand} className="bg-card rounded-2xl p-4 shadow-sm border border-border">
            <h3 className="font-bold text-foreground capitalize mb-3 flex items-center gap-2">
              ⭐ {brand.replace('-', ' ')}
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {sizes.map((s) => (
                <div key={s.kg} className="flex flex-col items-center bg-muted rounded-xl p-2">
                  <img src={s.img} alt={`${s.kg}kg`} className="w-12 h-12 object-contain mb-1" loading="lazy" />
                  <span className="text-xs font-semibold text-foreground">{s.kg}kg</span>
                  <div className="mt-1 w-full">
                    <input
                      type="number"
                      placeholder="0"
                      value={prices[brand]?.[s.kg] || ''}
                      onChange={(e) => updatePrice(brand, s.kg, e.target.value)}
                      className="w-full bg-card border border-border rounded-md px-2 py-1 text-xs text-center text-accent font-bold outline-none"
                    />
                    <span className="text-[10px] text-muted-foreground text-center block">TSh</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 pb-8 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 rounded-full bg-accent text-accent-foreground font-bold text-lg transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving ? <div className="w-5 h-5 border-2 border-accent-foreground border-t-transparent rounded-full animate-spin" /> : 'Save & Continue'}
        </button>
      </div>
    </div>
  );
};

export default PriceSettingPage;

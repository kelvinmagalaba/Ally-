import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Check, ChevronRight, Upload, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import logoLake from '@/assets/logo-lake-gas.png';
import logoPuma from '@/assets/logo-puma-gas.png';
import logoOryx from '@/assets/logo-oryx-gas.png';
import logoMihan from '@/assets/logo-mihan-gas.png';
import logoTotal from '@/assets/logo-total-gas.png';
import logoManjis from '@/assets/logo-manjis-gas.png';

const defaultBrands = [
  { id: 'oryx', name: 'Oryx Energies', logo: logoOryx },
  { id: 'taifa', name: 'Taifa Gas', logo: '' },
  { id: 'lake', name: 'Lake Gas', logo: logoLake },
  { id: 'total', name: 'Total Gas', logo: logoTotal },
  { id: 'mihan', name: 'Mihan Gas', logo: logoMihan },
  { id: 'puma', name: 'Puma Energy', logo: logoPuma },
  { id: 'manjis', name: 'Manjis Gas', logo: logoManjis },
];

const BrandSelectPage = () => {
  const { user, setUser, setPage } = useAppStore();
  const [selected, setSelected] = useState<string[]>(user.selected_brands || []);
  const [customBrands, setCustomBrands] = useState<Array<{ id: string; name: string; logo: string }>>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandLogo, setNewBrandLogo] = useState('');
  const [editingLogo, setEditingLogo] = useState<string | null>(null);
  const [brandLogos, setBrandLogos] = useState<Record<string, string>>({});

  const allBrands = [...defaultBrands, ...customBrands];

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    );
  };

  const handleLogoUpload = (callback: (dataUrl: string) => void) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => callback(reader.result as string);
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const handleEditLogo = (brandId: string) => {
    handleLogoUpload((dataUrl) => {
      setBrandLogos((prev) => ({ ...prev, [brandId]: dataUrl }));
      setEditingLogo(null);
    });
  };

  const handleAddBrand = () => {
    if (!newBrandName.trim()) return;
    const id = newBrandName.toLowerCase().replace(/\s/g, '-');
    setCustomBrands((prev) => [...prev, { id, name: newBrandName, logo: newBrandLogo || '' }]);
    setSelected((prev) => [...prev, id]);
    setNewBrandName('');
    setNewBrandLogo('');
    setShowAddForm(false);
  };

  const handleContinue = async () => {
    console.log('BRAND SAVE: Starting brand save process');
    console.log('BRAND SAVE: User ID:', user.userId);
    console.log('BRAND SAVE: Selected brands:', selected);
    
    if (!user.userId) {
      console.error('BRAND SAVE: User ID not found');
      toast.error('User ID not found');
      return;
    }

    if (selected.length === 0) {
      console.error('BRAND SAVE: No brands selected');
      toast.error('Please select at least one brand');
      return;
    }

    try {
      console.log('BRAND SAVE: Sending API request to /suppliers/brands/' + user.userId);
      
      // Save selected brands to backend with correct field name
      const response = await api.post(`/suppliers/brands/${user.userId}`, {
        selected_brands: selected  // FIXED: Use backend field name
      });

      console.log('BRAND SAVE: API response received:', response.data);

      if (response.data.success) {
        console.log('BRAND SAVE: Brands saved successfully, saved brands:', selected);
        console.log('BRAND SAVE: Backend returned selected_brands:', response.data.selected_brands);
        toast.success('Brands saved successfully');
        
        // Immediately refetch supplier status to get latest state
        try {
          console.log('BRAND SAVE: Immediately fetching supplier status after save');
          const statusResponse = await api.get(`/suppliers/status/${user.userId}`);
          console.log('BRAND SAVE: Status response:', statusResponse.data);
          
          if (statusResponse.data.success) {
            console.log('BRAND SAVE: Updating user state with latest data');
            console.log('BRAND SAVE: Frontend selected_brands before update:', user.selected_brands);
            console.log('BRAND SAVE: Backend selected_brands from status:', statusResponse.data.supplier?.selected_brands);
            
            // Update state with latest data from backend BEFORE navigation
            const latestBrands = statusResponse.data.supplier?.selected_brands || selected;
            setUser({ selected_brands: latestBrands });
            
            console.log('BRAND SAVE: Updated user state, new selected_brands:', latestBrands);
            console.log('BRAND SAVE: needsBrandSelection:', statusResponse.data.needsBrandSelection);
            console.log('BRAND SAVE: redirectUrl:', statusResponse.data.redirectUrl);
            
            // Navigate based on backend redirect logic
            if (!statusResponse.data.needsBrandSelection) {
              console.log('BRAND SAVE: Brands verified, navigating to:', statusResponse.data.redirectUrl);
              setPage(statusResponse.data.redirectUrl.replace('/', '') || 'seller-set-prices');
            } else {
              console.error('BRAND SAVE: Backend still says no brands selected');
              toast.error('Brand save verification failed - please try again');
            }
          } else {
            console.error('BRAND SAVE: Status check failed:', statusResponse.data.message);
            toast.error(statusResponse.data.message || 'Failed to verify brand save');
          }
        } catch (statusError) {
          console.error('BRAND SAVE: Error fetching status:', statusError);
          toast.error('Failed to verify brand save');
        }
      } else {
        console.error('BRAND SAVE: Backend returned failure:', response.data);
        toast.error(response.data.message || 'Failed to save brands');
      }
    } catch (error) {
      console.error('BRAND SAVE: Error saving brands:', error);
      console.error('BRAND SAVE: Error response:', error.response?.data);
      
      // Show specific backend error if available
      const errorMessage = error.response?.data?.message || error.message || 'Failed to save brands';
      toast.error(errorMessage);
    }
  };

  const getBrandLogo = (brand: { id: string; logo: string }) => {
    return brandLogos[brand.id] || brand.logo;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="px-6 pt-10 pb-4">
        <h1 className="text-2xl font-bold text-foreground">Select Gas Brands</h1>
        <p className="text-muted-foreground text-sm">Choose brands you want to sell</p>
      </div>

      <div className="flex-1 px-6 space-y-3 overflow-y-auto pb-4">
        {allBrands.map((brand) => {
          const logo = getBrandLogo(brand);
          return (
            <div key={brand.id} className="relative">
              <button
                onClick={() => toggle(brand.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all active:scale-[0.98] ${
                  selected.includes(brand.id)
                    ? 'border-accent bg-gas-light-green'
                    : 'border-border bg-card'
                }`}
              >
                <div className="w-14 h-14 rounded-xl bg-card border border-border flex items-center justify-center overflow-hidden">
                  {logo ? (
                    <img src={logo} alt={brand.name} className="w-full h-full object-contain p-1" />
                  ) : (
                    <span className="text-2xl">⛽</span>
                  )}
                </div>
                <span className="flex-1 text-left font-medium text-foreground">{brand.name}</span>
                {selected.includes(brand.id) && (
                  <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center">
                    <Check size={14} className="text-accent-foreground" />
                  </div>
                )}
              </button>
              {/* Edit logo button */}
              <button
                onClick={(e) => { e.stopPropagation(); handleEditLogo(brand.id); }}
                className="absolute top-2 right-2 w-7 h-7 bg-muted rounded-full flex items-center justify-center z-10"
              >
                <Edit2 size={12} className="text-muted-foreground" />
              </button>
            </div>
          );
        })}

        {showAddForm ? (
          <div className="bg-card border-2 border-dashed border-border rounded-xl p-4 space-y-3">
            <input
              type="text"
              placeholder="Brand Name"
              value={newBrandName}
              onChange={(e) => setNewBrandName(e.target.value)}
              className="w-full bg-muted rounded-lg px-3 py-2 text-sm outline-none text-foreground"
            />
            <div className="flex gap-2">
              <button onClick={() => handleLogoUpload((url) => setNewBrandLogo(url))} className="flex items-center gap-1 text-sm text-primary">
                <Upload size={14} /> {newBrandLogo ? 'Logo ✓' : 'Upload Logo'}
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddBrand} className="flex-1 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium">Add</button>
              <button onClick={() => setShowAddForm(false)} className="flex-1 py-2 bg-muted text-muted-foreground rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full py-3 border-2 border-dashed border-border rounded-xl text-muted-foreground text-sm font-medium"
          >
            + Add Another Brand
          </button>
        )}
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

export default BrandSelectPage;

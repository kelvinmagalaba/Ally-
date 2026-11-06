import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Save, ChevronRight, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

// Standard cylinder sizes
const CYLINDER_SIZES = ['6kg', '13kg', '25kg', '50kg'];

interface BrandPrice {
  [size: string]: string;
}

interface BrandPrices {
  [brand: string]: BrandPrice;
}

const SellerSetPricesPage = () => {
  const { user, setPage } = useAppStore();
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [brandPrices, setBrandPrices] = useState<BrandPrices>({});
  const [brandStock, setBrandStock] = useState<BrandPrices>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load supplier status and existing prices on component mount
  useEffect(() => {
    if (!user.userId) {
      console.error('PRICING: User ID not found');
      return;
    }

    loadSupplierStatus();
    loadExistingPrices();
  }, [user.userId]);

  const loadSupplierStatus = async () => {
    try {
      console.log('PRICING: Loading supplier status for user:', user.userId);
      
      const response = await api.get(`/suppliers/status/${user.userId}`);
      
      if (response.data.success) {
        const brands = response.data.supplier?.selected_brands || [];
        console.log('PRICING: Loaded selected brands from status:', brands);
        console.log('PRICING: needsBrandSelection:', response.data.needsBrandSelection);
        console.log('PRICING: pricing_completed:', response.data.pricing_completed);
        
        setSelectedBrands(brands);
        
        // Initialize price structure for each brand
        const initialPrices: BrandPrices = {};
        const initialStock: BrandPrices = {};
        brands.forEach(brand => {
          initialPrices[brand] = {};
          initialStock[brand] = {};
          CYLINDER_SIZES.forEach(size => {
            initialPrices[brand][size] = '';
            initialStock[brand][size] = '0';
          });
        });
        setBrandPrices(initialPrices);
        setBrandStock(initialStock);
      } else {
        console.error('PRICING: Failed to load supplier status:', response.data);
        toast.error(response.data.message || 'Failed to load supplier status');
      }
    } catch (error) {
      console.error('PRICING: Error loading supplier status:', error);
      toast.error('Failed to load supplier status');
    }
  };

  const loadExistingPrices = async () => {
    try {
      console.log('PRICING: Loading existing prices for user:', user.userId);
      
      const response = await api.get(`/supplier/prices/${user.userId}`);
      
      if (response.data.success) {
        console.log('PRICING: Loaded existing prices:', response.data.prices);
        
        // Merge current inventory with the selected-brand structure.
        setBrandPrices(prev => {
          const updated = { ...prev };
          Object.keys(response.data.prices).forEach(brand => {
            if (updated[brand]) {
              response.data.prices[brand].forEach((item: { size: string; price: number }) => {
                updated[brand][item.size] = item.price.toString();
              });
            }
          });
          return updated;
        });
        setBrandStock(prev => {
          const updated = { ...prev };
          Object.keys(response.data.prices).forEach(brand => {
            if (updated[brand]) {
              response.data.prices[brand].forEach((item: { size: string; stock_quantity: number }) => {
                updated[brand][item.size] = String(item.stock_quantity || 0);
              });
            }
          });
          return updated;
        });
      } else {
        console.error('PRICING: Failed to load existing prices:', response.data);
        // Don't show error for missing prices - this is normal for new sellers
      }
    } catch (error) {
      console.error('PRICING: Error loading existing prices:', error);
      // Don't show error for missing prices - this is normal for new sellers
    }
  };

  const handleStockChange = (brand: string, size: string, value: string) => {
    setBrandStock(prev => ({
      ...prev,
      [brand]: { ...prev[brand], [size]: value },
    }));
    if (errors[`${brand}-${size}-stock`]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[`${brand}-${size}-stock`];
        return next;
      });
    }
  };

  const handlePriceChange = (brand: string, size: string, value: string) => {
    console.log(`PRICING: Price change - ${brand} ${size}: ${value}`);
    
    setBrandPrices(prev => ({
      ...prev,
      [brand]: {
        ...prev[brand],
        [size]: value
      }
    }));

    // Clear error for this field if user is typing
    if (errors[`${brand}-${size}`]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[`${brand}-${size}`];
        return newErrors;
      });
    }
  };

  const validatePrices = (): boolean => {
    const newErrors: Record<string, string> = {};
    let isValid = true;

    selectedBrands.forEach(brand => {
      CYLINDER_SIZES.forEach(size => {
        const price = brandPrices[brand]?.[size] || '';
        const stock = brandStock[brand]?.[size] || '0';
        
        if (price.trim() === '') {
          newErrors[`${brand}-${size}`] = 'Price is required';
          isValid = false;
        } else {
          const numPrice = parseFloat(price);
          if (isNaN(numPrice) || numPrice <= 0) {
            newErrors[`${brand}-${size}`] = 'Price must be a positive number';
            isValid = false;
          } else if (numPrice < 100) {
            newErrors[`${brand}-${size}`] = 'Price seems too low (minimum 100)';
            isValid = false;
          } else if (numPrice > 100000) {
            newErrors[`${brand}-${size}`] = 'Price seems too high (maximum 100,000)';
            isValid = false;
          }
        }
        const stockNumber = Number(stock);
        if (!Number.isInteger(stockNumber) || stockNumber < 0) {
          newErrors[`${brand}-${size}-stock`] = 'Stock must be a whole number, zero or more';
          isValid = false;
        }
      });
    });

    setErrors(newErrors);
    return isValid;
  };

  const handleSave = async () => {
    console.log('PRICING: Starting save process');
    console.log('PRICING: Brand prices to save:', brandPrices);
    
    if (!validatePrices()) {
      console.error('PRICING: Validation failed');
      toast.error('Please fix validation errors before saving');
      return;
    }

    setSaving(true);
    
    try {
      // Convert to the format expected by backend
      const pricesData = [];
      selectedBrands.forEach(brand => {
        CYLINDER_SIZES.forEach(size => {
          const price = brandPrices[brand]?.[size] || '';
          if (price.trim() !== '') {
            pricesData.push({
              brand,
              size,
              price: parseFloat(price),
              stock_quantity: Number(brandStock[brand]?.[size] || 0),
              product_type: 'refill',
            });
          }
        });
      });

      console.log('PRICING: Sending price data:', pricesData);
      console.log('PRICING: API base URL:', api.defaults.baseURL);
      console.log('PRICING: Full URL will be:', api.defaults.baseURL + '/gas-prices/save');
      
      const response = await api.post('/gas-prices/save', {
        supplierId: user.userId,
        prices: pricesData
      });

      console.log('PRICING: Save response status:', response.status);
      console.log('PRICING: Save response data:', response.data);
      console.log('PRICING: Save response headers:', response.headers);

      if (response.data.success) {
        console.log('PRICING: Prices saved successfully');
        toast.success('Prices saved successfully');
        
        // Navigate to supplier dashboard
        setPage('supplier-dashboard');
      } else {
        console.error('PRICING: Save failed:', response.data);
        toast.error(response.data.message || 'Failed to save prices');
      }
    } catch (error) {
      console.error('PRICING: Error saving prices:', error);
      console.error('PRICING: Error response:', error.response?.data);
      
      const errorMessage = error.response?.data?.message || error.message || 'Failed to save prices';
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    console.log('PRICING: User chose to skip price setup');
    toast.warning('You can set prices later from your dashboard');
    setPage('supplier-dashboard');
  };

  if (selectedBrands.length === 0 && !loading) {
    console.log('PRICING: Showing No Brands Selected screen');
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">No Brands Selected</h2>
          <p className="text-muted-foreground mb-6">
            You need to select brands before setting up prices.
          </p>
          <button
            onClick={() => setPage('choose-brands')}
            className="w-full py-3 rounded-full bg-accent text-accent-foreground font-bold transition-all active:scale-95"
          >
            Go Back to Brand Selection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="px-6 pt-10 pb-4">
        <h1 className="text-2xl font-bold text-foreground mb-2">Set Your Prices</h1>
        <p className="text-muted-foreground text-sm mb-4">
          Set prices for each cylinder size for your selected brands. Customers will see these prices when ordering.
        </p>
      </div>

      <div className="flex-1 px-6 pb-4 overflow-y-auto">
        <div className="space-y-6">
          {selectedBrands.map(brand => (
            <div key={brand} className="bg-card rounded-xl border border-border p-4">
              <h3 className="text-lg font-semibold text-foreground mb-4 capitalize">{brand}</h3>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-sm font-medium text-muted-foreground">Size</th>
                      <th className="text-left py-2 px-3 text-sm font-medium text-muted-foreground">Price (TZS)</th>
                      <th className="text-left py-2 px-3 text-sm font-medium text-muted-foreground">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CYLINDER_SIZES.map(size => {
                      const fieldKey = `${brand}-${size}`;
                      const hasError = errors[fieldKey];
                      const stockError = errors[`${fieldKey}-stock`];
                      
                      return (
                        <tr key={size} className="border-b border-border/50">
                          <td className="py-3 px-3">
                            <span className="text-sm font-medium text-foreground">{size}</span>
                          </td>
                          <td className="py-3 px-3">
                            <input
                              type="number"
                              value={brandStock[brand]?.[size] || '0'}
                              onChange={(e) => handleStockChange(brand, size, e.target.value)}
                              className={`w-24 px-3 py-2 rounded-lg border text-sm outline-none ${stockError ? 'border-destructive bg-destructive/5' : 'border-border bg-background focus:border-primary'}`}
                              min="0"
                              step="1"
                            />
                            {stockError && <p className="text-destructive text-xs mt-1">{stockError}</p>}
                          </td>
                          <td className="py-3 px-3">
                            <input
                              type="number"
                              value={brandPrices[brand]?.[size] || ''}
                              onChange={(e) => handlePriceChange(brand, size, e.target.value)}
                              className={`w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors ${
                                hasError
                                  ? 'border-destructive bg-destructive/5'
                                  : 'border-border bg-background focus:border-primary'
                              }`}
                              placeholder="0"
                              min="100"
                              max="100000"
                              step="100"
                            />
                            {hasError && (
                              <p className="text-destructive text-xs mt-1">{hasError}</p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 pb-8 pt-2 space-y-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 rounded-full bg-accent text-accent-foreground font-bold text-lg transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <div className="w-5 h-5 border-2 border-accent-foreground border-t-transparent rounded-full animate-spin" />
              Saving Prices...
            </>
          ) : (
            <>
              <Save size={20} />
              Save All Prices
            </>
          )}
        </button>
        
        <button
          onClick={handleSkip}
          className="w-full py-3 rounded-full border border-border text-muted-foreground font-medium transition-all active:scale-95 hover:bg-muted"
        >
          Skip for Now (Set Up Later)
        </button>
      </div>
    </div>
  );
};

export default SellerSetPricesPage;

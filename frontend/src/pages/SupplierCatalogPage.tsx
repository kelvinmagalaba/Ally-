import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Search, ChevronRight, MapPin, Star } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface Supplier {
  id: number;
  full_name: string;
  city: string;
  area: string;
  brands?: string[];
}

interface BrandPrice {
  size: string;
  price: number;
}

interface SupplierPricing {
  [brand: string]: BrandPrice[];
}

const SupplierCatalogPage = () => {
  const { user, setPage } = useAppStore();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierPricing, setSupplierPricing] = useState<SupplierPricing>({});
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingPricing, setLoadingPricing] = useState(false);

  // Load suppliers on component mount
  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    try {
      console.log('CATALOG: Loading suppliers');
      setLoading(true);
      
      const response = await api.get('/suppliers/list');
      
      if (response.data.success) {
        console.log('CATALOG: Suppliers loaded:', response.data.suppliers);
        setSuppliers(response.data.suppliers);
      } else {
        console.error('CATALOG: Failed to load suppliers:', response.data);
        toast.error(response.data.message || 'Failed to load suppliers');
      }
    } catch (error) {
      console.error('CATALOG: Error loading suppliers:', error);
      toast.error('Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  };

  const loadSupplierPricing = async (supplierId: number) => {
    try {
      console.log('CATALOG: Loading pricing for supplier:', supplierId);
      setLoadingPricing(true);
      
      const response = await api.get(`/supplier/prices/${supplierId}`);
      
      if (response.data.success) {
        console.log('CATALOG: Pricing loaded:', response.data.prices);
        setSupplierPricing(response.data.prices);
      } else {
        console.error('CATALOG: Failed to load pricing:', response.data);
        toast.error(response.data.message || 'Failed to load pricing');
      }
    } catch (error) {
      console.error('CATALOG: Error loading pricing:', error);
      toast.error('Failed to load pricing');
    } finally {
      setLoadingPricing(false);
    }
  };

  const handleSupplierClick = (supplier: Supplier) => {
    console.log('CATALOG: Selected supplier:', supplier);
    setSelectedSupplier(supplier);
    setSelectedBrand('');
    loadSupplierPricing(supplier.id);
  };

  const handleBrandClick = (brand: string) => {
    console.log('CATALOG: Selected brand:', brand);
    setSelectedBrand(brand);
  };

  const handleBack = () => {
    if (selectedBrand) {
      setSelectedBrand('');
    } else if (selectedSupplier) {
      setSelectedSupplier(null);
      setSupplierPricing({});
    } else {
      setPage('customer-dashboard');
    }
  };

  const handleOrder = (brand: string, size: string, price: number) => {
    console.log('CATALOG: Starting order - Brand:', brand, 'Size:', size, 'Price:', price);
    
    // Store order data in local storage or context for order page
    const orderData = {
      supplierId: selectedSupplier?.id,
      supplierName: selectedSupplier?.full_name,
      brand,
      size,
      price
    };
    
    // Navigate to order page with pre-filled data
    setPage('create-order');
    
    // You could also store this in context or localStorage
    localStorage.setItem('pendingOrder', JSON.stringify(orderData));
    
    toast.success(`Ready to order ${brand} ${size} cylinder`);
  };

  // Filter suppliers based on search term
  const filteredSuppliers = suppliers.filter(supplier =>
    supplier.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.area.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading suppliers...</p>
        </div>
      </div>
    );
  }

  if (selectedSupplier && selectedBrand) {
    // Show brand pricing view
    const brandPrices = supplierPricing[selectedBrand] || [];
    
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="px-6 pt-10 pb-4">
          <button
            onClick={handleBack}
            className="text-primary text-sm font-medium mb-4"
          >
            ← Back to {selectedSupplier.full_name}
          </button>
          <h1 className="text-2xl font-bold text-foreground mb-2">{selectedBrand}</h1>
          <p className="text-muted-foreground text-sm mb-4">
            Choose cylinder size and price for {selectedBrand} gas
          </p>
        </div>

        <div className="flex-1 px-6 pb-4 overflow-y-auto">
          {loadingPricing ? (
            <div className="text-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Loading prices...</p>
            </div>
          ) : brandPrices.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No prices available for {selectedBrand}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {brandPrices.map((item, index) => (
                <div key={index} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground text-lg">{item.size}</h3>
                    <p className="text-muted-foreground text-sm">{selectedBrand} Gas Cylinder</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">TZS {item.price.toLocaleString()}</p>
                    <button
                      onClick={() => handleOrder(selectedBrand, item.size, item.price)}
                      className="w-full mt-2 py-2 bg-accent text-accent-foreground rounded-lg font-medium text-sm transition-all active:scale-95"
                    >
                      Order Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (selectedSupplier) {
    // Show brands view
    const availableBrands = Object.keys(supplierPricing);
    
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="px-6 pt-10 pb-4">
          <button
            onClick={handleBack}
            className="text-primary text-sm font-medium mb-4"
          >
            ← Back to Suppliers
          </button>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
              <span className="text-lg">⛽</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{selectedSupplier.full_name}</h1>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin size={14} />
                <span>{selectedSupplier.city}, {selectedSupplier.area}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 px-6 pb-4 overflow-y-auto">
          {loadingPricing ? (
            <div className="text-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Loading available brands...</p>
            </div>
          ) : availableBrands.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No brands available for this supplier</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {availableBrands.map(brand => (
                <button
                  key={brand}
                  onClick={() => handleBrandClick(brand)}
                  className="bg-card rounded-xl border border-border p-4 text-left transition-all active:scale-95 hover:border-primary"
                >
                  <h3 className="font-semibold text-foreground capitalize">{brand}</h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    {supplierPricing[brand]?.length || 0} sizes available
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show suppliers list
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="px-6 pt-10 pb-4">
        <h1 className="text-2xl font-bold text-foreground mb-2">Gas Suppliers</h1>
        <p className="text-muted-foreground text-sm mb-4">
          Choose a supplier to view their available gas brands and prices
        </p>
        
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
          <input
            type="text"
            placeholder="Search suppliers by name or location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-muted rounded-xl border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="flex-1 px-6 pb-4 overflow-y-auto">
        {filteredSuppliers.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              {searchTerm ? 'No suppliers found matching your search' : 'No suppliers available'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSuppliers.map((supplier, index) => (
              <button
                key={index}
                onClick={() => handleSupplierClick(supplier)}
                className="w-full bg-card rounded-xl border border-border p-4 text-left transition-all active:scale-95 hover:border-primary"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground text-lg">{supplier.full_name}</h3>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                      <MapPin size={14} />
                      <span>{supplier.city}, {supplier.area}</span>
                    </div>
                    {supplier.brands && supplier.brands.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {supplier.brands.map((brand, brandIndex) => (
                          <span
                            key={brandIndex}
                            className="px-2 py-1 bg-muted text-xs rounded-full text-muted-foreground"
                          >
                            {brand}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="text-muted-foreground" size={20} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SupplierCatalogPage;

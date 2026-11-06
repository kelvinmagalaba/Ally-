import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { 
  Home, 
  Package, 
  ShoppingCart, 
  BarChart3, 
  MessageSquare, 
  ChevronRight,
  TrendingUp,
  Users,
  DollarSign,
  PackageOpen
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface BrandPricing {
  [brand: string]: {
    [size: string]: number;
  };
}

interface DashboardStats {
  totalOrders: number;
  revenue: number;
  topBrand: string;
  topCylinderSize: string;
  dailyOrders: Array<{
    date: string;
    orders: number;
  }>;
  pendingOrders: number;
  completedOrders: number;
}

const SellerDashboardPage = () => {
  const { user, setPage } = useAppStore();
  const [activeSection, setActiveSection] = useState('dashboard');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [brandPricing, setBrandPricing] = useState<BrandPricing>({});
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedBrand, setExpandedBrand] = useState<string>('');

  // Handler functions for price editing
  const handleEditPrices = () => {
    setPage('seller-set-prices');
    toast.info('Edit all prices');
  };

  const handleAddPrices = (brand: string) => {
    setPage('seller-set-prices');
    toast.info(`Setting prices for ${brand}`);
  };

  const handleEditPrice = (brand: string, size: string, currentPrice: number) => {
    const newPrice = prompt(`Edit price for ${brand} - ${size}:`, currentPrice.toString());
    if (newPrice && !isNaN(Number(newPrice)) && Number(newPrice) > 0) {
      updatePrice(brand, size, Number(newPrice));
    } else if (newPrice !== null) {
      toast.error('Please enter a valid price');
    }
  };

  const handleAddMorePrices = (brand: string) => {
    toast.info(`Adding more cylinder sizes for ${brand}`);
    setPage('seller-set-prices');
  };

  const updatePrice = async (brand: string, size: string, price: number) => {
    try {
      console.log('DASHBOARD: Updating price:', { brand, size, price });
      
      const response = await api.post('/gas-prices/save', {
        supplierId: user.userId,
        prices: [{ brand, size, price }]
      });

      if (response.data.success) {
        toast.success(`Price updated for ${brand} - ${size}`);
        await loadPricingData();
      } else {
        toast.error(response.data.message || 'Failed to update price');
      }
    } catch (error) {
      console.error('DASHBOARD: Error updating price:', error);
      toast.error('Failed to update price');
    }
  };

  // Load dashboard data on component mount
  useEffect(() => {
    if (!user.userId) return;
    
    console.log('DASHBOARD: User data loaded:', user);
    console.log('DASHBOARD: Profile image:', user.profileImage);
    console.log('DASHBOARD: Profile image type:', typeof user.profileImage);
    console.log('DASHBOARD: Profile image length:', user.profileImage ? user.profileImage.length : 0);
    
    loadDashboardData();
    
    // Set up real-time updates (will be implemented with Socket.io)
    // setupRealtimeUpdates();
  }, [user.userId]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      console.log('DASHBOARD: Loading seller dashboard data for user:', user.userId);
      
      // Load selected brands
      await loadSelectedBrands();
      
      // Load pricing data
      await loadPricingData();
      
      // Load analytics stats
      await loadStats();
      
    } catch (error) {
      console.error('DASHBOARD: Error loading dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedBrands = async () => {
    try {
      const response = await api.get(`/suppliers/status/${user.userId}`);
      
      if (response.data.success) {
        const brands = response.data.supplier?.selected_brands || [];
        setSelectedBrands(brands);
        console.log('DASHBOARD: Selected brands loaded:', brands);
      }
    } catch (error) {
      console.error('DASHBOARD: Error loading selected brands:', error);
    }
  };

  const loadPricingData = async () => {
    try {
      const response = await api.get(`/gas-prices/${user.userId}`);
      
      if (response.data.success) {
        // Fix: Use response.data.data (not response.data.prices)
        const data = response.data.data;
        setBrandPricing(data || {});
        console.log('DASHBOARD: Pricing data loaded:', data);
      }
    } catch (error) {
      console.error('DASHBOARD: Error loading pricing data:', error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await api.get(`/seller/stats/${user.userId}`);
      
      if (response.data.success) {
        setStats(response.data.stats);
        console.log('DASHBOARD: Stats loaded:', response.data.stats);
      }
    } catch (error) {
      console.error('DASHBOARD: Error loading stats:', error);
    }
  };

  const handleBrandToggle = (brand: string) => {
    setExpandedBrand(expandedBrand === brand ? '' : brand);
  };

  const handleViewOrders = () => {
    setActiveSection('orders');
  };

  const handleViewAnalytics = () => {
    setActiveSection('analytics');
  };

  
  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'brands', label: 'Brands & Pricing', icon: Package },
    { id: 'orders', label: 'Orders', icon: ShoppingCart },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
  ];

  const renderDashboardSection = () => (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <ShoppingCart className="text-primary" size={20} />
              <span className="text-xs text-muted-foreground">Total</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.totalOrders}</p>
            <p className="text-xs text-muted-foreground">Orders</p>
          </div>
          
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="text-green-500" size={20} />
              <span className="text-xs text-muted-foreground">Revenue</span>
            </div>
            <p className="text-2xl font-bold text-foreground">TZS {stats.revenue.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="text-blue-500" size={20} />
              <span className="text-xs text-muted-foreground">Top Brand</span>
            </div>
            <p className="text-lg font-bold text-foreground capitalize">{stats.topBrand || 'N/A'}</p>
            <p className="text-xs text-muted-foreground">Most Popular</p>
          </div>
          
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <PackageOpen className="text-orange-500" size={20} />
              <span className="text-xs text-muted-foreground">Top Size</span>
            </div>
            <p className="text-lg font-bold text-foreground">{stats.topCylinderSize || 'N/A'}</p>
            <p className="text-xs text-muted-foreground">Best Seller</p>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-card rounded-xl border border-border p-4">
        <h3 className="font-semibold text-foreground mb-4">Quick Actions</h3>
        <div className="space-y-3">
          <button
            onClick={handleEditPrices}
            className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium transition-all active:scale-95"
          >
            Edit Prices
          </button>
          <button
            onClick={handleViewOrders}
            className="w-full py-3 bg-accent text-accent-foreground rounded-lg font-medium transition-all active:scale-95"
          >
            View Orders
          </button>
          <button
            onClick={handleViewAnalytics}
            className="w-full py-3 border border-border text-foreground rounded-lg font-medium transition-all active:scale-95"
          >
            View Analytics
          </button>
        </div>
      </div>

      {/* Recent Orders Preview */}
      <div className="bg-card rounded-xl border border-border p-4">
        <h3 className="font-semibold text-foreground mb-4">Recent Orders</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <div>
              <p className="text-sm font-medium text-foreground">Order #1234</p>
              <p className="text-xs text-muted-foreground">Shell 6kg - Customer: John</p>
            </div>
            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">Pending</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-foreground">Order #1233</p>
              <p className="text-xs text-muted-foreground">Oryx 13kg - Customer: Mary</p>
            </div>
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Delivered</span>
          </div>
        </div>
        <button
          onClick={handleViewOrders}
          className="w-full mt-4 py-2 text-primary text-sm font-medium"
        >
          View All Orders
        </button>
      </div>
    </div>
  );

  const renderBrandsSection = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Brands & Pricing</h2>
        <button
          onClick={handleEditPrices}
          className="py-2 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-all active:scale-95"
        >
          Edit Prices
        </button>
      </div>

      {selectedBrands.length === 0 ? (
        <div className="text-center py-8">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No Brands Selected</h3>
          <p className="text-muted-foreground mb-4">
            You haven't selected any brands yet.
          </p>
          <button
            onClick={() => setPage('choose-brands')}
            className="py-2 px-4 bg-primary text-primary-foreground rounded-lg font-medium transition-all active:scale-95"
          >
            Select Brands
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.keys(brandPricing).map(brand => {
            const brandPrices = brandPricing[brand] || {};
            const isExpanded = expandedBrand === brand;
            const sizeCount = Object.keys(brandPrices).length;
            
            return (
              <div key={brand} className="bg-card rounded-xl border border-border overflow-hidden">
                <button
                  onClick={() => handleBrandToggle(brand)}
                  className="w-full p-4 text-left flex items-center justify-between transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <span className="text-lg">{'\u26fd'}</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground capitalize">{brand}</h3>
                      <p className="text-sm text-muted-foreground">
                        {sizeCount} cylinder sizes available
                      </p>
                    </div>
                  </div>
                  <ChevronRight 
                    className={`text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
                    size={20} 
                  />
                </button>
                
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border/50">
                    {sizeCount === 0 ? (
                      <div className="py-4 text-center">
                        <p className="text-muted-foreground text-sm mb-3">No prices set for {brand}</p>
                        <button
                          onClick={() => handleAddPrices(brand)}
                          className="py-2 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-all active:scale-95"
                        >
                          Set Prices
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(brandPrices).map(([size, price]) => (
                          <div key={size} className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-lg">
                            <span className="text-sm font-medium text-foreground">{size}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-primary">TZS {Number(price).toLocaleString()}</span>
                              <button
                                onClick={() => handleEditPrice(brand, size, Number(price))}
                                className="p-1 text-muted-foreground hover:text-primary transition-colors"
                                title="Edit price"
                              >
                                <PackageOpen className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                        <button
                          onClick={() => handleAddMorePrices(brand)}
                          className="w-full mt-2 py-2 px-3 bg-muted/50 text-muted-foreground rounded-lg text-sm font-medium transition-all active:scale-95"
                        >
                          Add More Sizes
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderOrdersSection = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-foreground">Orders</h2>
      
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between py-3 border-b border-border/50">
            <div>
              <p className="font-medium text-foreground">Order #1234</p>
              <p className="text-sm text-muted-foreground">Shell 6kg - Customer: John Doe</p>
              <p className="text-xs text-muted-foreground mt-1">2 hours ago</p>
            </div>
            <div className="text-right">
              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">Pending</span>
              <p className="text-sm font-bold text-primary mt-1">TZS 5,000</p>
            </div>
          </div>
          
          <div className="flex items-center justify-between py-3 border-b border-border/50">
            <div>
              <p className="font-medium text-foreground">Order #1233</p>
              <p className="text-sm text-muted-foreground">Oryx 13kg - Customer: Mary Jane</p>
              <p className="text-xs text-muted-foreground mt-1">5 hours ago</p>
            </div>
            <div className="text-right">
              <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">Confirmed</span>
              <p className="text-sm font-bold text-primary mt-1">TZS 11,500</p>
            </div>
          </div>
          
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-foreground">Order #1232</p>
              <p className="text-sm text-muted-foreground">Total 25kg - Customer: Bob Smith</p>
              <p className="text-xs text-muted-foreground mt-1">Yesterday</p>
            </div>
            <div className="text-right">
              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Delivered</span>
              <p className="text-sm font-bold text-primary mt-1">TZS 22,000</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAnalyticsSection = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-foreground">Analytics</h2>
      
      <div className="bg-card rounded-xl border border-border p-4">
        <h3 className="font-semibold text-foreground mb-4">Order Trends</h3>
        <div className="h-48 bg-muted/30 rounded-lg flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Chart will be implemented here</p>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="font-semibold text-foreground mb-2">Brand Performance</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Shell</span>
              <span className="font-medium text-foreground">45%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Oryx</span>
              <span className="font-medium text-foreground">35%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-medium text-foreground">20%</span>
            </div>
          </div>
        </div>
        
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="font-semibold text-foreground mb-2">Size Distribution</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">6kg</span>
              <span className="font-medium text-foreground">40%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">13kg</span>
              <span className="font-medium text-foreground">35%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">25kg</span>
              <span className="font-medium text-foreground">25%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderMessagesSection = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-foreground">Messages</h2>
      
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-sm">JD</span>
            </div>
            <div className="flex-1">
              <p className="font-medium text-foreground">John Doe</p>
              <p className="text-sm text-muted-foreground">When will my order arrive?</p>
            </div>
            <span className="text-xs text-muted-foreground">2m ago</span>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-lg">
            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
              <span className="text-sm">MJ</span>
            </div>
            <div className="flex-1">
              <p className="font-medium text-foreground">Mary Jane</p>
              <p className="text-sm text-muted-foreground">Thank you for the delivery!</p>
            </div>
            <span className="text-xs text-muted-foreground">1h ago</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return renderDashboardSection();
      case 'brands':
        return renderBrandsSection();
      case 'orders':
        return renderOrdersSection();
      case 'analytics':
        return renderAnalyticsSection();
      case 'messages':
        return renderMessagesSection();
      default:
        return renderDashboardSection();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <div className="w-64 bg-card border-r border-border">
        <div className="p-6">
          {/* Profile Section */}
          <div className="flex flex-col items-center mb-6">
            {user.profileImage ? (
              <img 
                src={user.profileImage.startsWith('data:') ? user.profileImage : `${api.defaults.baseURL.replace('/api', '')}/uploads/${user.profileImage}`}
                alt="Profile" 
                className="w-16 h-16 rounded-full object-cover mb-3"
              />
            ) : (
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-3">
                <span className="text-2xl text-muted-foreground">{'\ud83d\udc64'}</span>
              </div>
            )}
            <h2 className="text-lg font-semibold text-foreground">{user.fullName || 'Seller'}</h2>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <p className="text-xs text-muted-foreground">{user.city}, {user.area}</p>
          </div>
          
          <h1 className="text-xl font-bold text-foreground mb-6">Seller Dashboard</h1>
          
          <nav className="space-y-2">
            {sidebarItems.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    activeSection === item.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Icon size={20} />
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default SellerDashboardPage;

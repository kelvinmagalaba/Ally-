import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { countryCodes } from '@/data/countryCodes';
import { Camera, Eye, EyeOff, Phone, Mail, Lock, User, Bike, FileText, Search, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { api, API_URL, setAuthToken } from '@/lib/api';
import { mapUserFromApi } from '@/lib/mapUserFromApi';
import { connectAuthenticatedSocket } from '@/socket';

const AuthPage = () => {
  const { user, setUser, setPage } = useAppStore();
  const [mode, setMode] = useState<'login' | 'signup'>(() => {
    const requestedLogin = sessionStorage.getItem('cgd_auth_mode') === 'login';
    sessionStorage.removeItem('cgd_auth_mode');
    return requestedLogin ? 'login' : 'signup';
  });
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [countryIdx, setCountryIdx] = useState(countryCodes.findIndex((c) => c.name === 'Tanzania'));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [profileImage, setProfileImage] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [drivingLicense, setDrivingLicense] = useState('');
  const [searchCountry, setSearchCountry] = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [city, setCity] = useState('');
  const [locationArea, setLocationArea] = useState('');

  const selectedCountry = countryCodes[countryIdx >= 0 ? countryIdx : 0];
  const isDriver = user.role === 'driver' || user.role === 'delivery_guy';

  const filteredCountries = countryCodes.filter(
    (c) =>
      c.name.toLowerCase().includes(searchCountry.toLowerCase()) || c.code.includes(searchCountry)
  );

  const handleImageUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => setProfileImage(reader.result as string);
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (mode === 'signup' && !fullName.trim()) e.fullName = 'Full name is required';
    if (mode === 'signup' && !phone.trim()) e.phone = 'Phone number is required';
    if (mode === 'signup' && !email.trim()) e.email = 'Email is required';
    else if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email';
    if (mode === 'login' && !email.trim() && !phone.trim()) e.email = 'Enter your email or phone number';
    if (!password) e.password = 'Password is required';
    else if (mode === 'signup' && password.length < 8) e.password = 'Minimum 8 characters';
    if (mode === 'signup' && password !== confirmPassword) e.confirmPassword = 'Passwords do not match';
    if (mode === 'signup' && isDriver && !plateNumber.trim()) e.plateNumber = 'Plate number is required';
    if (mode === 'signup' && isDriver && !drivingLicense.trim()) e.drivingLicense = 'Driving license is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const navigateAfterAuth = (role: string | null) => {
    if (role === 'admin') setPage('admin-dashboard');
    else if (role === 'supplier') setPage('supplier-dashboard');
    else if (role === 'driver' || role === 'delivery_guy') setPage('driver-dashboard');
    else setPage('customer-dashboard');
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      if (mode === 'login') {
        const identifierPhone = phone.trim() ? `${selectedCountry.code}${phone}` : undefined;
        const { data } = await api.post('/auth/login', {
          email: email.trim() || undefined,
          phone: email.trim() ? undefined : identifierPhone,
          password,
        });
        if (!data.success) return toast.error(data.message || 'Login failed');
        if (data.requiresOTP) {
          setUser({ phone: data.phone });
          if (import.meta.env.DEV && data.devCode) toast.info(`Development OTP: ${data.devCode}`);
          toast.message(data.message || 'Verify your phone to continue');
          setPage('verify-otp');
          return;
        }
        setAuthToken(data.token);
        const mapped = mapUserFromApi(data.user as Record<string, unknown>);
        setUser(mapped);
        connectAuthenticatedSocket();
        toast.success('Welcome back');
        navigateAfterAuth(mapped.role);
      } else {
        const payload = {
          fullName,
          email,
          phone: `${selectedCountry.code} ${phone}`,
          role: user.role,
          country: selectedCountry.name,
          city: city || user.city,
          area: locationArea || user.area,
          gps: '',
          profile_image: profileImage,
          password,
          plateNumber: isDriver ? plateNumber : '',
          drivingLicense: isDriver ? drivingLicense : '',
          latitude: '',
          longitude: '',
        };
        const { data } = await api.post('/auth/register', payload);
        if (!data.success) {
          toast.error(data.message || 'Registration failed');
          return;
        }
        const raw = data.user as Record<string, unknown> | undefined;
        if (raw) {
          const m = mapUserFromApi(raw);
          setUser(m);
        } else if (data.userId) {
          setUser({ userId: Number(data.userId), role: user.role });
        } else {
          toast.error('Registration incomplete');
          return;
        }
        setUser({ phone: data.phone || `${selectedCountry.code} ${phone}` });
        if (import.meta.env.DEV && data.devCode) toast.info(`Development OTP: ${data.devCode}`);
        toast.success('Account created. Verify your phone to continue.');
        setPage('verify-otp');
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as { message?: string } | undefined;
        if (body?.message && typeof body.message === 'string') {
          toast.error(body.message);
          return;
        }
        const offline =
          err.code === 'ERR_NETWORK' ||
          err.message === 'Network Error' ||
          err.code === 'ECONNABORTED' ||
          !err.response;
        toast.error(
          offline
            ? `Cannot reach API at ${API_URL}. Run the backend on port 5000, use the same Wi‑Fi, and check Windows Firewall.`
            : err.message || 'Request failed'
        );
      } else {
        toast.error('Something went wrong. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const roleLabel =
    user.role === 'supplier'
      ? 'Seller'
      : user.role === 'driver' || user.role === 'delivery_guy'
        ? 'Delivery Guy'
        : user.role === 'admin'
          ? 'Admin'
          : 'Customer';
  const headerColor =
    user.role === 'supplier'
      ? 'from-green-500 to-green-600'
      : user.role === 'driver' || user.role === 'delivery_guy'
        ? 'from-primary to-orange-600'
        : user.role === 'admin'
          ? 'from-slate-700 to-slate-900'
          : 'from-blue-500 to-blue-600';

  return (
    <div className="min-h-screen flex flex-col">
      <div className={`bg-gradient-to-br ${headerColor} px-6 pt-10 pb-16 text-center`}>
        {mode === 'signup' && (
          <>
            <button
              type="button"
              onClick={handleImageUpload}
              className="mx-auto w-20 h-20 rounded-full bg-card/20 border-2 border-card/40 flex items-center justify-center overflow-hidden mb-3"
            >
              {profileImage ? (
                <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <Camera className="text-primary-foreground" size={28} />
              )}
            </button>
            <p className="text-primary-foreground/80 text-xs">Upload Photo</p>
          </>
        )}
        <h1 className="text-2xl font-bold text-primary-foreground mt-3">{roleLabel} {mode === 'login' ? 'Login' : 'Registration'}</h1>
        <p className="text-primary-foreground/70 text-sm">CGD — Cooking Gas Delivery</p>
      </div>

      <div className="flex-1 bg-background -mt-6 rounded-t-3xl px-6 pt-6 pb-8 overflow-y-auto">
        <div className="flex bg-muted rounded-full p-1 mb-6">
          <button
            onClick={() => setMode('signup')}
            className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all ${mode === 'signup' ? 'bg-accent text-accent-foreground shadow' : 'text-muted-foreground'}`}
          >
            Sign Up
          </button>
          <button
            onClick={() => setMode('login')}
            className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all ${mode === 'login' ? 'bg-accent text-accent-foreground shadow' : 'text-muted-foreground'}`}
          >
            Login
          </button>
        </div>

        <div className="space-y-4">
          {mode === 'signup' && (
            <div>
              <div className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3">
                <User size={18} className="text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
                />
              </div>
              {errors.fullName && <p className="text-destructive text-xs mt-1 ml-2">{errors.fullName}</p>}
            </div>
          )}

          {mode === 'signup' && (
            <>
              <div>
                <div className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3">
                  <MapPin size={18} className="text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="City (e.g. Dar es Salaam)"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3">
                  <MapPin size={18} className="text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Area / Street (e.g. Mikocheni B)"
                    value={locationArea}
                    onChange={(e) => setLocationArea(e.target.value)}
                    className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-3">
              <Phone size={18} className="text-muted-foreground" />
              <button
                onClick={() => setShowCountryPicker(true)}
                className="flex items-center gap-1 text-sm text-foreground whitespace-nowrap"
              >
                {selectedCountry.flag} {selectedCountry.code}
              </button>
              <input
                type="tel"
                placeholder="Phone Number"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
            {errors.phone && <p className="text-destructive text-xs mt-1 ml-2">{errors.phone}</p>}
          </div>

          {showCountryPicker && (
            <div className="fixed inset-0 bg-foreground/50 z-50 flex items-end justify-center">
              <div className="bg-background w-full max-w-lg rounded-t-3xl max-h-[70vh] flex flex-col">
                <div className="px-4 pt-4 pb-2">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-foreground">Select Country</h3>
                    <button onClick={() => setShowCountryPicker(false)} className="text-muted-foreground text-sm">
                      Close
                    </button>
                  </div>
                  <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                    <Search size={16} className="text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search country..."
                      value={searchCountry}
                      onChange={(e) => setSearchCountry(e.target.value)}
                      className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-4">
                  {filteredCountries.map((c) => (
                    <button
                      key={`${c.code}-${c.name}`}
                      onClick={() => {
                        const idx = countryCodes.findIndex((cc) => cc.name === c.name);
                        setCountryIdx(idx);
                        setShowCountryPicker(false);
                        setSearchCountry('');
                      }}
                      className="w-full flex items-center gap-3 py-3 border-b border-border text-left"
                    >
                      <span className="text-lg">{c.flag}</span>
                      <span className="flex-1 text-sm text-foreground">{c.name}</span>
                      <span className="text-sm text-muted-foreground">{c.code}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3">
              <Mail size={18} className="text-muted-foreground" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
            {errors.email && <p className="text-destructive text-xs mt-1 ml-2">{errors.email}</p>}
          </div>

          <div>
            <div className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3">
              <Lock size={18} className="text-muted-foreground" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
              />
              <button onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? (
                  <EyeOff size={18} className="text-muted-foreground" />
                ) : (
                  <Eye size={18} className="text-muted-foreground" />
                )}
              </button>
            </div>
            {errors.password && <p className="text-destructive text-xs mt-1 ml-2">{errors.password}</p>}
          </div>

          {mode === 'signup' && (
            <div>
              <div className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3">
                <Lock size={18} className="text-muted-foreground" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  aria-label="Show or hide confirmation password"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={18} className="text-muted-foreground" />
                  ) : (
                    <Eye size={18} className="text-muted-foreground" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-destructive text-xs mt-1 ml-2">{errors.confirmPassword}</p>
              )}
            </div>
          )}

          {mode === 'signup' && isDriver && (
            <>
              <div>
                <div className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3">
                  <Bike size={18} className="text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Motorcycle Plate Number"
                    value={plateNumber}
                    onChange={(e) => setPlateNumber(e.target.value)}
                    className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                {errors.plateNumber && <p className="text-destructive text-xs mt-1 ml-2">{errors.plateNumber}</p>}
              </div>
              <div>
                <div className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3">
                  <FileText size={18} className="text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Driving License Number"
                    value={drivingLicense}
                    onChange={(e) => setDrivingLicense(e.target.value)}
                    className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                {errors.drivingLicense && (
                  <p className="text-destructive text-xs mt-1 ml-2">{errors.drivingLicense}</p>
                )}
              </div>
            </>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4 px-2">
          CGD requests location only after you tap “Use my current location”. You can choose a map pin manually instead.
        </p>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full mt-4 py-4 rounded-full bg-accent text-accent-foreground font-bold text-lg transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-accent-foreground border-t-transparent rounded-full animate-spin" />
          ) : mode === 'signup' ? (
            'Sign Up'
          ) : (
            'Login'
          )}
        </button>
      </div>
    </div>
  );
};

export default AuthPage;

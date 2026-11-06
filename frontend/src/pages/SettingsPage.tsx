import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, Phone, Save, User } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { mapUserFromApi } from '@/lib/mapUserFromApi';
import { useAppStore } from '@/store/useAppStore';

function dashboardFor(role: string | null) {
  if (role === 'admin') return 'admin-dashboard';
  if (role === 'supplier') return 'supplier-dashboard';
  if (role === 'driver' || role === 'delivery_guy') return 'driver-dashboard';
  return 'customer-dashboard';
}

export default function SettingsPage() {
  const { user, setUser, setPage } = useAppStore();
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (newPassword && newPassword.length < 8) return toast.error('New password must have at least 8 characters');
    if (newPassword !== confirmPassword) return toast.error('New passwords do not match');
    const loginChanged = email.trim() !== user.email || phone.trim() !== user.phone || Boolean(newPassword);
    if (loginChanged && !currentPassword) return toast.error('Enter your current password to change login details');
    setSaving(true);
    try {
      const { data } = await api.put('/auth/settings', {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        currentPassword,
        newPassword: newPassword || undefined,
      });
      if (!data.success) return toast.error(data.message || 'Could not save settings');
      setUser(mapUserFromApi(data.user as Record<string, unknown>));
      toast.success(data.message || 'Settings saved');
      if (data.requiresOTP) {
        if (import.meta.env.DEV && data.devCode) toast.info(`Development OTP: ${data.devCode}`);
        setPage('verify-otp');
      } else {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const passwordInput = (
    label: string,
    value: string,
    setter: (value: string) => void,
    visible: boolean,
    toggle: () => void,
  ) => (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-card px-3">
        <Lock size={16} className="text-muted-foreground" />
        <input className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" type={visible ? 'text' : 'password'} value={value} onChange={(event) => setter(event.target.value)} />
        <button type="button" onClick={toggle} aria-label={`Show or hide ${label.toLowerCase()}`}>
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </label>
  );

  return (
    <div className="min-h-screen bg-background px-5 py-8">
      <button type="button" onClick={() => setPage(dashboardFor(user.role))} className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft size={18} /> Back to dashboard
      </button>
      <p className="text-xs font-semibold text-primary">CGD — Cooking Gas Delivery</p>
      <h1 className="mt-1 text-2xl font-bold">Account settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Update your profile and secure login details. Phone changes require a new OTP.</p>

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Full name</span>
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-card px-3">
            <User size={16} /><input className="flex-1 bg-transparent py-3 text-sm outline-none" value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </div>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Email</span>
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-card px-3">
            <Mail size={16} /><input type="email" className="flex-1 bg-transparent py-3 text-sm outline-none" value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Tanzania phone number</span>
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-card px-3">
            <Phone size={16} /><input type="tel" className="flex-1 bg-transparent py-3 text-sm outline-none" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>
        </label>
        {passwordInput('Current password', currentPassword, setCurrentPassword, showCurrent, () => setShowCurrent((value) => !value))}
        {passwordInput('New password (optional)', newPassword, setNewPassword, showNew, () => setShowNew((value) => !value))}
        {passwordInput('Confirm new password', confirmPassword, setConfirmPassword, showConfirm, () => setShowConfirm((value) => !value))}
      </div>

      <button type="button" disabled={saving} onClick={save} className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 font-semibold text-primary-foreground disabled:opacity-60">
        <Save size={18} /> {saving ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  );
}

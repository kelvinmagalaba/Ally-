import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { api, setAuthToken } from '@/lib/api';
import { mapUserFromApi } from '@/lib/mapUserFromApi';
import { connectAuthenticatedSocket } from '@/socket';
import { ArrowLeft, Phone, Key } from 'lucide-react';

const OTPVerificationPage = () => {
  const { user, setUser, setPage } = useAppStore();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  // Countdown timer for resend button
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  const handleVerify = async () => {
    if (!otp.trim() || otp.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/auth/verify-login-otp', {
        phone: user.phone,
        code: otp
      });

      if (data.success) {
        toast.success('OTP verified successfully!');
        setAuthToken(data.token);
        connectAuthenticatedSocket();

        // Set user data
        const mapped = mapUserFromApi(data.user as Record<string, unknown>);
        setUser(mapped);

        setPage(mapped.role === 'admin' ? 'admin-dashboard' : 'account-created');
      } else {
        toast.error(data.message || 'Invalid OTP');
      }
    } catch (error) {
      console.error('OTP verification error:', error);
      toast.error('Failed to verify OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCountdown > 0) return; // Prevent spamming

    setResendLoading(true);
    try {
      const { data } = await api.post('/otp/generate', {
        phone: user.phone
      });

      if (data.success) {
        toast.success('OTP sent again to your phone');
        setResendCountdown(30); // Start 30 second countdown

        // Show development code if available
        if (import.meta.env.DEV && data.devCode) {
          toast.info(`Development OTP: ${data.devCode}`);
        }
      } else {
        toast.error(data.message || 'Failed to resend OTP');
      }
    } catch (error: unknown) {
      console.error('Resend OTP error:', error);
      const response = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { status?: number; data?: { message?: string } } }).response
        : undefined;
      if (response?.status === 429) {
        toast.error(response.data?.message || 'Please wait before requesting another OTP');
        setResendCountdown(30); // Start countdown on rate limit
      } else {
        toast.error('Failed to resend OTP');
      }
    } finally {
      setResendLoading(false);
    }
  };

  const handleBack = () => {
    setPage('auth');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <Key className="w-6 h-6 text-blue-600" />
          </div>
          <CardTitle className="text-2xl font-bold">Verify Your Phone</CardTitle>
          <CardDescription>
            We've sent a 6-digit code to {user.phone}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="otp" className="text-sm font-medium">
              Enter OTP Code
            </label>
            <Input
              id="otp"
              type="text"
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center text-lg tracking-widest"
              maxLength={6}
            />
          </div>

          <Button
            onClick={handleVerify}
            className="w-full"
            disabled={loading || otp.length !== 6}
          >
            {loading ? 'Verifying...' : 'Verify & Continue'}
          </Button>

          <div className="text-center space-y-2">
            <p className="text-sm text-gray-600">
              Didn't receive the code?
            </p>
            <Button
              variant="outline"
              onClick={handleResend}
              disabled={resendLoading || resendCountdown > 0}
              className="w-full"
            >
              {resendLoading
                ? 'Sending...'
                : resendCountdown > 0
                  ? `Resend in ${resendCountdown}s`
                  : 'Resend OTP'
              }
            </Button>
          </div>

          <Button
            variant="ghost"
            onClick={handleBack}
            className="w-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default OTPVerificationPage;

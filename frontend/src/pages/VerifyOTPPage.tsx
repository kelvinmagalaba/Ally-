import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Shield, ArrowLeft, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

const VerifyOTPPage = () => {
  const { user, setPage, setUser } = useAppStore();
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const [canResend, setCanResend] = useState(false);

  // Countdown timer
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [timeLeft]);

  // Format time display
  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle OTP input change
  const handleOtpChange = (index, value) => {
    if (value.length > 1) {
      // Handle paste
      const pastedValue = value.slice(0, 6);
      const newOtp = pastedValue.split('');
      setOtpCode(newOtp);
      
      // Focus on the last filled input
      if (pastedValue.length < 6) {
        const nextInput = document.getElementById(`otp-${pastedValue.length}`);
        nextInput?.focus();
      }
    } else {
      const newOtp = [...otpCode];
      newOtp[index] = value;
      setOtpCode(newOtp);
      
      // Auto-focus next input
      if (value && index < 5) {
        const nextInput = document.getElementById(`otp-${index + 1}`);
        nextInput?.focus();
      }
    }
  };

  // Handle key press for navigation
  const handleKeyPress = (index, e) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  // Handle OTP submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const code = otpCode.join('');
    if (code.length !== 6) {
      toast.error('Please enter all 6 digits');
      return;
    }

    setLoading(true);
    
    try {
      const response = await api.post('/api/otp/verify', {
        phone: user.phone,
        code: code
      });

      if (response.data.success) {
        toast.success('OTP verified successfully!');
        
        // Update user state to mark as verified
        setUser({
          otpVerified: true
        });
        
        // Redirect to appropriate dashboard based on role
        switch (user.role) {
          case 'customer':
            setPage('customer-dashboard');
            break;
          case 'supplier':
            setPage('supplier-dashboard');
            break;
          case 'delivery_guy':
          case 'driver':
            setPage('driver-dashboard');
            break;
          case 'admin':
            setPage('admin-dashboard');
            break;
          default:
            setPage('customer-dashboard');
        }
      } else {
        toast.error(response.data.message || 'Invalid OTP code');
      }
    } catch (error) {
      console.error('OTP verification error:', error);
      toast.error(error.response?.data?.message || 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  };

  // Handle resend OTP
  const handleResend = async () => {
    setResending(true);
    
    try {
      const response = await api.post('/api/otp/generate', {
        phone: user.phone
      });

      if (response.data.success) {
        toast.success('OTP sent successfully!');
        
        // Reset timer
        setTimeLeft(300);
        setCanResend(false);
        setOtpCode(['', '', '', '', '', '']);
        
        // Show development code if available
        if (process.env.NODE_ENV === 'development' && response.data.devCode) {
          toast.info(`Development OTP: ${response.data.devCode}`);
        }
      } else {
        toast.error(response.data.message || 'Failed to resend OTP');
      }
    } catch (error) {
      console.error('Resend OTP error:', error);
      toast.error(error.response?.data?.message || 'Failed to resend OTP');
    } finally {
      setResending(false);
    }
  };

  // Handle go back
  const handleGoBack = () => {
    // Clear user state and go back to login
    setUser(null);
    setPage('login');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Verify Your Phone</h1>
          <p className="text-muted-foreground">
            We've sent a 6-digit code to {user.phone}
          </p>
        </div>

        {/* OTP Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* OTP Input */}
          <div className="flex justify-center gap-2">
            {otpCode.map((digit, index) => (
              <input
                key={index}
                id={`otp-${index}`}
                type="text"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyPress(index, e)}
                className="w-12 h-12 text-center text-lg font-semibold border-2 border-border rounded-lg focus:border-primary focus:outline-none transition-colors"
                disabled={loading}
              />
            ))}
          </div>

          {/* Timer */}
          <div className="text-center">
            {timeLeft > 0 ? (
              <p className="text-sm text-muted-foreground">
                Code expires in {formatTime(timeLeft)}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Code has expired
              </p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || otpCode.join('').length !== 6}
            className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                Verifying...
              </div>
            ) : (
              'Verify Code'
            )}
          </button>

          {/* Resend Button */}
          <div className="text-center">
            {canResend ? (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="text-primary hover:text-primary/80 font-medium text-sm flex items-center gap-2 mx-auto transition-colors disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${resending ? 'animate-spin' : ''}`} />
                {resending ? 'Sending...' : 'Resend Code'}
              </button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Didn't receive the code? Wait for {formatTime(timeLeft)} to resend
              </p>
            )}
          </div>
        </form>

        {/* Back Button */}
        <div className="mt-6 text-center">
          <button
            onClick={handleGoBack}
            className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-2 mx-auto transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default VerifyOTPPage;

/**
 * Login Flow Service
 * Manages the complete onboarding flow: login -> GPS -> save location -> check brands -> redirect
 */

import { api } from '@/lib/api';
import LocationPermissionService, { LocationPosition } from './locationPermissionService';

export interface LoginFlowState {
  step: 'login' | 'gps' | 'saving_location' | 'checking_brands' | 'complete';
  error?: string;
  isLoading: boolean;
}

export interface LoginResult {
  success: boolean;
  user?: { userId?: number; id?: number; [key: string]: unknown };
  redirectUrl?: string;
  needsBrandSelection?: boolean;
  requiresOTP?: boolean;
  phone?: string;
  message?: string;
  devCode?: string;
  error?: string;
}

class LoginFlowService {
  private static instance: LoginFlowService;
  private locationService: LocationPermissionService;
  private state: LoginFlowState = {
    step: 'login',
    isLoading: false
  };

  static getInstance(): LoginFlowService {
    if (!LoginFlowService.instance) {
      LoginFlowService.instance = new LoginFlowService();
    }
    return LoginFlowService.instance;
  }

  constructor() {
    this.locationService = LocationPermissionService.getInstance();
  }

  /**
   * Get current flow state
   */
  getState(): LoginFlowState {
    return { ...this.state };
  }

  /**
   * Update flow state
   */
  private setState(newState: Partial<LoginFlowState>): void {
    this.state = { ...this.state, ...newState };
    console.log('LOGIN FLOW: State updated:', this.state);
  }

  /**
   * Execute complete onboarding flow
   */
  async executeOnboardingFlow(email: string, password: string, phone?: string): Promise<LoginResult> {
    console.log('LOGIN FLOW: Starting onboarding flow');
    console.log('LOGIN FLOW: Step 1 - Login');
    
    this.setState({ step: 'login', isLoading: true, error: undefined });

    try {
      // Step 1: Login
      const loginResult = await this.performLogin(email, password, phone);
      
      if (!loginResult.success) {
        this.setState({ step: 'login', isLoading: false, error: loginResult.error });
        return loginResult;
      }

      // If OTP is required, return early
      if (loginResult.requiresOTP) {
        this.setState({ step: 'login', isLoading: false });
        return loginResult;
      }

      if (!loginResult.user) {
        this.setState({ step: 'login', isLoading: false, error: 'No user data received' });
        return { success: false, error: 'No user data received' };
      }

      console.log('LOGIN FLOW: Login successful, proceeding to GPS');
      console.log('LOGIN FLOW: Step 2 - GPS Permission');
      
      // Step 2: Request GPS permission
      this.setState({ step: 'gps', isLoading: true });
      const locationResult = await this.requestLocationPermission();
      
      if (!locationResult.success) {
        console.log('LOGIN FLOW: GPS failed, but continuing with flow');
        // Don't fail the entire flow if GPS is denied, just continue
      }

      console.log('LOGIN FLOW: GPS handled, proceeding to save location');
      console.log('LOGIN FLOW: Step 3 - Save Location');
      
      // Step 3: Save location to backend
      if (locationResult.position) {
        this.setState({ step: 'saving_location', isLoading: true });
        await this.saveLocationToBackend(loginResult.user.userId, locationResult.position);
      }

      console.log('LOGIN FLOW: Location saved, checking brands');
      console.log('LOGIN FLOW: Step 4 - Check Selected Brands');
      
      // Step 4: Check selected brands and determine redirect
      this.setState({ step: 'checking_brands', isLoading: true });
      const brandCheckResult = await this.checkSelectedBrands(loginResult.user.userId);
      
      console.log('LOGIN FLOW: Brand check complete:', brandCheckResult);
      
      const finalResult: LoginResult = {
        success: true,
        user: loginResult.user,
        redirectUrl: brandCheckResult.redirectUrl,
        needsBrandSelection: brandCheckResult.needsBrandSelection
      };

      console.log('LOGIN FLOW: Flow completed successfully');
      this.setState({ step: 'complete', isLoading: false });
      
      return finalResult;

    } catch (error) {
      console.error('LOGIN FLOW: Flow failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.setState({ step: 'login', isLoading: false, error: errorMessage });
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Perform login API call
   */
  private async performLogin(email: string, password: string, phone?: string): Promise<LoginResult> {
    try {
      console.log('LOGIN: Sending login request');
      
      const response = await api.post('/auth/login', {
        email: email || undefined,
        phone: phone || undefined,
        password
      });

      console.log('LOGIN: Login response received:', response.data);

      if (response.data.success) {
        return {
          success: true,
          user: response.data.user,
          redirectUrl: response.data.redirectUrl,
          needsBrandSelection: response.data.needsBrandSelection,
          requiresOTP: response.data.requiresOTP,
          phone: response.data.phone,
          message: response.data.message,
          devCode: response.data.devCode
        };
      } else {
        return {
          success: false,
          error: response.data.message || 'Login failed'
        };
      }
    } catch (error) {
      console.error('LOGIN: Login error:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Login failed';
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Request location permission
   */
  private async requestLocationPermission(): Promise<{ success: boolean; position?: LocationPosition; error?: string }> {
    try {
      console.log('GPS: Requesting location permission');
      
      // First check if geolocation is supported
      if (!this.locationService.isGeolocationSupported()) {
        console.log('GPS: Geolocation not supported');
        return {
          success: false,
          error: 'Geolocation is not supported by this browser'
        };
      }

      // Check current permission status
      const permissionStatus = await this.locationService.checkPermissionStatus();
      console.log('GPS: Permission status:', permissionStatus);

      if (permissionStatus.denied) {
        console.log('GPS: Permission denied, showing message');
        this.locationService.showPermissionDeniedMessage();
        return {
          success: false,
          error: 'Location permission denied'
        };
      }

      if (permissionStatus.unsupported) {
        console.log('GPS: Geolocation unsupported');
        return {
          success: false,
          error: 'Geolocation not supported'
        };
      }

      // Request location
      const position = await this.locationService.requestLocationPermission({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5 minutes
      });

      console.log('GPS: Location received:', position);
      
      return {
        success: true,
        position
      };

    } catch (error) {
      console.error('GPS: Error requesting location:', error);
      
      if (error instanceof GeolocationPositionError) {
        if (error.code === GeolocationPositionError.PERMISSION_DENIED) {
          this.locationService.showPermissionDeniedMessage();
        }
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Location request failed'
      };
    }
  }

  /**
   * Save location to backend
   */
  private async saveLocationToBackend(userId: number, position: LocationPosition): Promise<void> {
    try {
      console.log('LOCATION: Saving location to backend');
      console.log('LOCATION: User ID:', userId);
      console.log('LOCATION: Position:', position);
      
      const response = await api.put(`/auth/user/${userId}`, {
        latitude: position.latitude,
        longitude: position.longitude,
        gps: `${position.latitude},${position.longitude}`
      });

      console.log('LOCATION: Location save response:', response.data);

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to save location');
      }

      console.log('LOCATION: Location saved successfully');
      
    } catch (error) {
      console.error('LOCATION: Error saving location:', error);
      // Don't throw error - location save failure shouldn't break the flow
      console.log('LOCATION: Continuing flow despite location save failure');
    }
  }

  /**
   * Check selected brands status and pricing completion
   */
  private async checkSelectedBrands(userId: number): Promise<{ needsBrandSelection: boolean; needsPricingSetup: boolean; redirectUrl: string }> {
    try {
      console.log('BRANDS: Checking onboarding status for user:', userId);
      
      const response = await api.get(`/suppliers/status/${userId}`);
      
      console.log('BRANDS: Status check response:', response.data);

      if (response.data.success) {
        return {
          needsBrandSelection: response.data.needsBrandSelection,
          needsPricingSetup: !response.data.pricing_completed,
          redirectUrl: response.data.redirectUrl || '/choose-brands'
        };
      } else {
        console.error('BRANDS: Status check failed:', response.data.message);
        // If we can't check status, assume brand selection is needed
        return { 
          needsBrandSelection: true, 
          needsPricingSetup: false,
          redirectUrl: '/choose-brands'
        };
      }
      
    } catch (error) {
      console.error('BRANDS: Error checking brands:', error);
      // If we can't check brands, assume brand selection is needed
      return { 
        needsBrandSelection: true, 
        needsPricingSetup: false,
        redirectUrl: '/choose-brands'
      };
    }
  }

  /**
   * Reset flow state
   */
  reset(): void {
    console.log('LOGIN FLOW: Resetting flow state');
    this.state = {
      step: 'login',
      isLoading: false
    };
  }
}

export default LoginFlowService;

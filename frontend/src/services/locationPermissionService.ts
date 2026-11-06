/**
 * Location Permission Service
 * Handles GPS permission requests and location saving for onboarding flow
 */

export interface LocationPosition {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: number;
}

export interface LocationPermissionStatus {
  granted: boolean;
  denied: boolean;
  unsupported: boolean;
  error?: string;
}

class LocationPermissionService {
  private static instance: LocationPermissionService;

  static getInstance(): LocationPermissionService {
    if (!LocationPermissionService.instance) {
      LocationPermissionService.instance = new LocationPermissionService();
    }
    return LocationPermissionService.instance;
  }

  /**
   * Check if geolocation is supported
   */
  isGeolocationSupported(): boolean {
    return 'geolocation' in navigator;
  }

  /**
   * Check current permission status
   */
  async checkPermissionStatus(): Promise<LocationPermissionStatus> {
    console.log('GPS: Checking permission status');
    
    if (!this.isGeolocationSupported()) {
      console.log('GPS: Geolocation not supported');
      return {
        granted: false,
        denied: false,
        unsupported: true,
        error: 'Geolocation is not supported by this browser'
      };
    }

    try {
      // Try to get current position to check permission
      const position = await this.getCurrentPosition({ timeout: 1000 });
      console.log('GPS: Permission granted, position:', position);
      return {
        granted: true,
        denied: false,
        unsupported: false
      };
    } catch (error) {
      console.log('GPS: Permission check failed:', error);
      
      if (error instanceof GeolocationPositionError) {
        switch (error.code) {
          case GeolocationPositionError.PERMISSION_DENIED:
            console.log('GPS: Permission denied');
            return {
              granted: false,
              denied: true,
              unsupported: false,
              error: 'Location permission was denied'
            };
          case GeolocationPositionError.POSITION_UNAVAILABLE:
            console.log('GPS: Position unavailable');
            return {
              granted: false,
              denied: false,
              unsupported: false,
              error: 'Location information is unavailable'
            };
          case GeolocationPositionError.TIMEOUT:
            console.log('GPS: Request timeout');
            return {
              granted: false,
              denied: false,
              unsupported: false,
              error: 'Location request timed out'
            };
          default:
            console.log('GPS: Unknown error:', error.message);
            return {
              granted: false,
              denied: false,
              unsupported: false,
              error: 'Unknown location error: ' + error.message
            };
        }
      }
      
      return {
        granted: false,
        denied: false,
        unsupported: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Request location permission and get current position
   */
  async requestLocationPermission(options?: PositionOptions): Promise<LocationPosition> {
    console.log('GPS: Requesting location permission');
    
    if (!this.isGeolocationSupported()) {
      console.error('GPS: Geolocation not supported');
      throw new Error('Geolocation is not supported by this browser');
    }

    const defaultOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000, // 5 minutes
      ...options
    };

    return this.getCurrentPosition(defaultOptions);
  }

  /**
   * Get current position with promise wrapper
   */
  private getCurrentPosition(options: PositionOptions): Promise<LocationPosition> {
    return new Promise((resolve, reject) => {
      console.log('GPS: Getting current position with options:', options);
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('GPS: Position received:', position);
          const locationData: LocationPosition = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
          };
          resolve(locationData);
        },
        (error) => {
          console.error('GPS: Error getting position:', error);
          reject(error);
        },
        options
      );
    });
  }

  /**
   * Watch position changes
   */
  watchPosition(callback: (position: LocationPosition) => void, options?: PositionOptions): number {
    console.log('GPS: Starting position watch');
    
    if (!this.isGeolocationSupported()) {
      throw new Error('Geolocation is not supported by this browser');
    }

    const defaultOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000, // 1 minute
      ...options
    };

    return navigator.geolocation.watchPosition(
      (position) => {
        const locationData: LocationPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        };
        callback(locationData);
      },
      (error) => {
        console.error('GPS: Watch position error:', error);
      },
      defaultOptions
    );
  }

  /**
   * Clear position watch
   */
  clearWatch(watchId: number): void {
    console.log('GPS: Clearing position watch');
    navigator.geolocation.clearWatch(watchId);
  }

  /**
   * Show location permission denied popup
   */
  showPermissionDeniedMessage(): void {
    console.log('GPS: Showing permission denied message');
    
    // Create a user-friendly message
    const message = `
      Location Permission Required
      
      This app needs access to your location to provide the best service.
      Please enable location access in your browser settings:
      
      1. Click the location icon (or padlock) in the address bar
      2. Allow location access
      3. Refresh the page
      
      Location is used to:
      - Show nearby suppliers
      - Calculate delivery distances
      - Provide accurate service areas
    `;
    
    alert(message.trim());
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

export default LocationPermissionService;

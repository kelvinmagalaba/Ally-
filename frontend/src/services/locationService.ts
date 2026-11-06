import axios from 'axios';
import { io, Socket } from 'socket.io-client';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
}

export interface NearbyUser {
  id: number;
  email: string;
  role: string;
  latitude: number;
  longitude: number;
  full_name?: string;
  phone?: string;
  profile_image?: string;
  distance_km: number;
  last_updated_location?: string;
}

export interface NearbySupplier {
  user_id: number;
  full_name: string;
  phone: string;
  profile_image?: string;
  latitude: number;
  longitude: number;
  city: string;
  area: string;
  selected_brands?: string[];
  prices?: Record<string, Record<string, number>>;
  distance_km: number;
}

export interface NearbyDriver {
  id: number;
  user_id: number;
  full_name: string;
  phone: string;
  vehicle_type: string;
  plate_number: string;
  status: string;
  latitude: number;
  longitude: number;
  distance_km: number;
}

export interface Report {
  id: number;
  user_id: number;
  latitude: number;
  longitude: number;
  description: string;
  status: 'pending' | 'in_progress' | 'resolved';
  created_at: string;
  updated_at: string;
  email?: string;
  full_name?: string;
  distance_km?: number;
}

export interface NearbyResponse<T> {
  data: T[];
  center: {
    latitude: number;
    longitude: number;
  };
  radius: number;
}

class LocationService {
  private watchId: number | null = null;
  private locationUpdateInterval: NodeJS.Timeout | null = null;
  private socket: Socket | null = null;
  private locationUpdateCallbacks: ((location: LocationData) => void)[] = [];
  private nearbyUsersCallbacks: ((data: { users: NearbyUser[]; center: { latitude: number; longitude: number }; radius: number }) => void)[] = [];

  constructor() {
    this.initializeSocket();
  }

  private initializeSocket() {
    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('Location service connected to socket');
    });

    this.socket.on('locationUpdated', (data: { userId: number; lat: number; lng: number; timestamp: number }) => {
      console.log('Location update received:', data);
    });

    this.socket.on('nearbyUsers', (data) => {
      console.log('Nearby users received:', data);
      this.nearbyUsersCallbacks.forEach(callback => callback(data));
    });

    this.socket.on('driverLocationUpdate', (data) => {
      console.log('Driver location update:', data);
    });

    this.socket.on('disconnect', () => {
      console.log('Location service disconnected from socket');
    });
  }

  // Request GPS location permission (like Bolt)
  async requestLocationPermission(): Promise<LocationData> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const locationData: LocationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          };
          resolve(locationData);
        },
        (error) => {
          let errorMessage = 'Unknown error occurred';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location permission denied by user';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location information is unavailable';
              break;
            case error.TIMEOUT:
              errorMessage = 'Location request timed out';
              break;
          }
          reject(new Error(errorMessage));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000, // Accept cached location up to 1 minute old
        }
      );
    });
  }

  // Start watching location changes
  startLocationTracking(callback: (location: LocationData) => void): void {
    if (!navigator.geolocation) {
      console.error('Geolocation is not supported by this browser');
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const locationData: LocationData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };
        callback(locationData);
      },
      (error) => {
        console.error('Location tracking error:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000, // Accept cached location up to 30 seconds old
      }
    );
  }

  // Stop location tracking
  stopLocationTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.locationUpdateInterval) {
      clearInterval(this.locationUpdateInterval);
      this.locationUpdateInterval = null;
    }
  }

  // Update user location on server
  async updateUserLocation(userId: number, location: LocationData): Promise<unknown> {
    try {
      const response = await axios.post(`${API_BASE_URL}/locations/update`, {
        user_id: userId,
        latitude: location.latitude,
        longitude: location.longitude,
      });

      // Also emit real-time update via socket
      if (this.socket) {
        this.socket.emit('updateUserLocation', {
          userId,
          lat: location.latitude,
          lng: location.longitude
        });
      }

      return response.data;
    } catch (error) {
      console.error('Error updating user location:', error);
      throw error;
    }
  }

  // Request nearby users via socket (real-time)
  requestNearbyUsers(userId: number, location: LocationData, radius: number = 5, role?: string): void {
    if (this.socket) {
      this.socket.emit('requestNearbyUsers', {
        userId,
        latitude: location.latitude,
        longitude: location.longitude,
        radius,
        role
      });
    }
  }

  // Subscribe to location updates
  onLocationUpdate(callback: (location: LocationData) => void): void {
    this.locationUpdateCallbacks.push(callback);
  }

  // Subscribe to nearby users updates
  onNearbyUsers(callback: (data: { users: NearbyUser[]; center: { latitude: number; longitude: number }; radius: number }) => void): void {
    this.nearbyUsersCallbacks.push(callback);
  }

  // Join user room for location updates
  joinUserRoom(userId: number): void {
    if (this.socket) {
      this.socket.emit('join', userId);
    }
  }

  // Get nearby users
  async getNearbyUsers(location: LocationData, radius: number = 5, role?: string): Promise<NearbyResponse<NearbyUser>> {
    try {
      const params = new URLSearchParams({
        latitude: location.latitude.toString(),
        longitude: location.longitude.toString(),
        radius: radius.toString(),
      });

      if (role) {
        params.append('role', role);
      }

      const response = await axios.get(`${API_BASE_URL}/locations/nearby/users?${params}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching nearby users:', error);
      throw error;
    }
  }

  // Get nearby suppliers
  async getNearbySuppliers(location: LocationData, radius: number = 5): Promise<NearbyResponse<NearbySupplier>> {
    try {
      const params = new URLSearchParams({
        latitude: location.latitude.toString(),
        longitude: location.longitude.toString(),
        radius: radius.toString(),
      });

      const response = await axios.get(`${API_BASE_URL}/locations/nearby/suppliers?${params}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching nearby suppliers:', error);
      throw error;
    }
  }

  // Get nearby drivers
  async getNearbyDrivers(location: LocationData, radius: number = 5): Promise<NearbyResponse<NearbyDriver>> {
    try {
      const params = new URLSearchParams({
        latitude: location.latitude.toString(),
        longitude: location.longitude.toString(),
        radius: radius.toString(),
      });

      const response = await axios.get(`${API_BASE_URL}/locations/nearby/drivers?${params}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching nearby drivers:', error);
      throw error;
    }
  }

  // Create a report with GPS location
  async createReport(userId: number, location: LocationData, description: string): Promise<unknown> {
    try {
      const response = await axios.post(`${API_BASE_URL}/locations/report`, {
        user_id: userId,
        latitude: location.latitude,
        longitude: location.longitude,
        description,
      });
      return response.data;
    } catch (error) {
      console.error('Error creating report:', error);
      throw error;
    }
  }

  // Get all reports (optionally filtered by location)
  async getAllReports(location?: LocationData, radius: number = 10): Promise<{ reports: Report[]; center?: { latitude: number; longitude: number }; radius?: number }> {
    try {
      const params = new URLSearchParams();

      if (location) {
        params.append('latitude', location.latitude.toString());
        params.append('longitude', location.longitude.toString());
        params.append('radius', radius.toString());
      }

      const response = await axios.get(`${API_BASE_URL}/locations/reports?${params}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching reports:', error);
      throw error;
    }
  }

  // Start automatic location updates (every 30 seconds)
  startAutomaticLocationUpdates(userId: number, callback?: (location: LocationData) => void): void {
    const updateLocation = async () => {
      try {
        const location = await this.requestLocationPermission();
        await this.updateUserLocation(userId, location);
        if (callback) {
          callback(location);
        }
      } catch (error) {
        console.error('Automatic location update failed:', error);
      }
    };

    // Update immediately
    updateLocation();

    // Then update every 30 seconds
    this.locationUpdateInterval = setInterval(updateLocation, 30000);
  }

  // Stop automatic location updates
  stopAutomaticLocationUpdates(): void {
    if (this.locationUpdateInterval) {
      clearInterval(this.locationUpdateInterval);
      this.locationUpdateInterval = null;
    }
  }

  // Calculate distance between two points (Haversine formula)
  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in kilometers
  }
}

export const locationService = new LocationService();

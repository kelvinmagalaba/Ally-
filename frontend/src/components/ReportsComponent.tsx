import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { locationService, Report, LocationData } from '@/services/locationService';
import GoogleMap, { createMarkersFromData } from './GoogleMap';
import { AlertTriangle, MapPin, Clock, CheckCircle, XCircle, MessageSquare, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const ReportsComponent: React.FC = () => {
  const { user, deviceGeo } = useAppStore();
  const [reports, setReports] = useState<Report[]>([]);
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchRadius, setSearchRadius] = useState(10);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const currentLocation: LocationData | undefined = 
    deviceGeo.status === 'granted' && deviceGeo.lat && deviceGeo.lng
      ? { latitude: deviceGeo.lat, longitude: deviceGeo.lng }
      : undefined;

  // Load reports
  const loadReports = async () => {
    setIsLoading(true);
    try {
      const response = await locationService.getAllReports(currentLocation, searchRadius);
      setReports(response.reports);
    } catch (error) {
      console.error('Error loading reports:', error);
      toast.error('Failed to load reports');
    } finally {
      setIsLoading(false);
    }
  };

  // Create new report
  const handleCreateReport = async () => {
    if (!user.userId) {
      toast.error('You must be logged in to create a report');
      return;
    }

    if (!description.trim()) {
      toast.error('Please enter a description for your report');
      return;
    }

    if (!currentLocation) {
      toast.error('Location access is required to create a report');
      return;
    }

    setIsLoading(true);
    try {
      await locationService.createReport(user.userId, currentLocation, description);
      setDescription('');
      setShowCreateForm(false);
      await loadReports();
      toast.success('Report created successfully');
    } catch (error) {
      console.error('Error creating report:', error);
      toast.error('Failed to create report');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter reports
  const filteredReports = reports.filter(report => {
    if (filterStatus === 'all') return true;
    return report.status === filterStatus;
  });

  // Get status icon and color
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'pending':
        return { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-100' };
      case 'in_progress':
        return { icon: MessageSquare, color: 'text-blue-600', bg: 'bg-blue-100' };
      case 'resolved':
        return { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100' };
      default:
        return { icon: XCircle, color: 'text-gray-600', bg: 'bg-gray-100' };
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Load reports on mount and when dependencies change
  useEffect(() => {
    loadReports();
  }, [currentLocation, searchRadius]);

  // Create map markers
  const mapMarkers = createMarkersFromData(
    undefined, // users
    undefined, // suppliers
    undefined, // drivers
    filteredReports, // reports
    currentLocation // current location
  );

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-20">
      <div className="px-4 sm:px-6 pt-8 md:pt-10 animate-fade-in space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle size={24} className="text-orange-500" />
            Reports & Issues
          </h1>
          <Button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {showCreateForm ? 'Cancel' : 'New Report'}
          </Button>
        </div>

        {/* Location Status */}
        <div className={`rounded-lg p-3 ${
          currentLocation 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-yellow-50 border border-yellow-200'
        }`}>
          <div className="flex items-center gap-2">
            <MapPin size={16} className={currentLocation ? 'text-green-600' : 'text-yellow-600'} />
            <span className={`text-sm ${
              currentLocation ? 'text-green-800' : 'text-yellow-800'
            }`}>
              {currentLocation 
                ? `Location: ${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)}`
                : 'Location access required for accurate reports'}
            </span>
          </div>
        </div>

        {/* Create Report Form */}
        {showCreateForm && (
          <div className="bg-card rounded-xl border border-border p-4 space-y-4">
            <h3 className="font-semibold text-foreground">Create New Report</h3>
            
            <div>
              <label className="text-sm text-muted-foreground">Description</label>
              <Textarea
                placeholder="Describe the issue or report..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1"
                rows={4}
              />
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin size={14} />
              <span>Location will be automatically added from your GPS</span>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleCreateReport}
                disabled={isLoading || !description.trim() || !currentLocation}
                className="flex-1"
              >
                {isLoading ? 'Creating...' : 'Submit Report'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filters:</span>
          </div>
          
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Radius:</label>
            <Select value={searchRadius.toString()} onValueChange={(value) => setSearchRadius(Number(value))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 km</SelectItem>
                <SelectItem value="10">10 km</SelectItem>
                <SelectItem value="25">25 km</SelectItem>
                <SelectItem value="50">50 km</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMap(!showMap)}
          >
            {showMap ? 'Hide Map' : 'Show Map'}
          </Button>
        </div>

        {/* Map View */}
        {showMap && currentLocation && (
          <div className="space-y-2">
            <h3 className="font-semibold text-foreground">Reports Map</h3>
            <GoogleMap
              center={currentLocation}
              markers={mapMarkers}
              height="400px"
              className="rounded-xl"
            />
          </div>
        )}

        {/* Reports List */}
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">
            Reports ({filteredReports.length})
          </h3>
          
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
              <p className="text-sm text-muted-foreground mt-2">Loading reports...</p>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="text-center py-8 bg-card rounded-xl border border-border">
              <AlertTriangle size={32} className="mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {filterStatus === 'all' 
                  ? 'No reports found in your area' 
                  : `No ${filterStatus} reports found`}
              </p>
            </div>
          ) : (
            filteredReports.map((report) => {
              const statusInfo = getStatusInfo(report.status);
              const StatusIcon = statusInfo.icon;
              
              return (
                <div key={report.id} className="bg-card rounded-xl border border-border p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`p-1 rounded ${statusInfo.bg}`}>
                          <StatusIcon size={16} className={statusInfo.color} />
                        </div>
                        <span className="font-semibold text-foreground">Report #{report.id}</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${statusInfo.bg} ${statusInfo.color}`}>
                          {report.status.replace('_', ' ')}
                        </span>
                      </div>
                      
                      <p className="text-sm text-foreground mb-2">{report.description}</p>
                      
                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin size={12} />
                          {report.distance_km 
                            ? `${report.distance_km.toFixed(1)} km away`
                            : `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}`}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatDate(report.created_at)}
                        </span>
                        {report.full_name && (
                          <span>By: {report.full_name}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportsComponent;

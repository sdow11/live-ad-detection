import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';

interface MobileDevice {
  id: string;
  deviceId: string;
  name: string;
  model: string;
  os: string;
  osVersion: string;
  appVersion: string;
  capabilities: string[];
  isPaired: boolean;
  isOnline: boolean;
  lastSeen: Date;
  batteryLevel: number;
  networkType: string;
  fingerprint?: string;
}

interface DeviceCardProps {
  device: MobileDevice;
  onUnpair: (device: MobileDevice) => void;
  onShowDetails: (device: MobileDevice) => void;
  onEditPermissions: (device: MobileDevice) => void;
  onRefresh: (device: MobileDevice) => void;
  className?: string;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({
  device: initialDevice,
  onUnpair,
  onShowDetails,
  onEditPermissions,
  onRefresh,
  className = ''
}) => {
  const { subscribe, isConnected } = useWebSocket();
  const [device, setDevice] = useState(initialDevice);
  const [isLoading, setIsLoading] = useState(false);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check for mobile screen
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Subscribe to device status updates
  useEffect(() => {
    if (isConnected && device.id) {
      const unsubscribe = subscribe(`device.${device.id}.status`, (update: any) => {
        setDevice(prev => ({
          ...prev,
          ...update,
          lastSeen: update.lastSeen ? new Date(update.lastSeen) : prev.lastSeen
        }));
        
        // Highlight card on update
        setIsHighlighted(true);
        setTimeout(() => setIsHighlighted(false), 2000);
      });

      return unsubscribe;
    }
  }, [device.id, isConnected, subscribe]);

  // Handle refresh action
  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    setIsHighlighted(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      onRefresh(device);
    } finally {
      setIsLoading(false);
      setTimeout(() => setIsHighlighted(false), 1000);
    }
  }, [device, onRefresh]);

  // Get battery level styling
  const getBatteryStyle = useCallback((level: number) => {
    if (level <= 20) return 'text-red-600';
    if (level <= 50) return 'text-yellow-600';
    return 'text-green-600';
  }, []);

  // Get network type display
  const getNetworkDisplay = useCallback((type: string) => {
    return type === 'wifi' ? 'WiFi' : type.charAt(0).toUpperCase() + type.slice(1);
  }, []);

  // Get capability display names
  const getCapabilityName = useCallback((capability: string) => {
    const names: Record<string, string> = {
      'stream_control': 'Stream Control',
      'pip_control': 'PiP Control',
      'notifications': 'Notifications',
      'analytics': 'Analytics',
      'settings': 'Settings'
    };
    return names[capability] || capability;
  }, []);

  // Check if device has full access
  const hasFullAccess = useMemo(() => {
    const fullCapabilities = ['stream_control', 'pip_control', 'notifications', 'analytics', 'settings'];
    return fullCapabilities.every(cap => device.capabilities.includes(cap));
  }, [device.capabilities]);

  // Get card styling based on device state
  const getCardStyling = useCallback(() => {
    const baseClasses = 'bg-white rounded-lg shadow-sm border p-4 space-y-3 transition-all duration-200';
    const onlineClasses = device.isOnline ? 'border-green-200' : 'border-gray-200';
    const highlightClasses = isHighlighted ? 'ring-2 ring-blue-500' : '';
    const mobileClasses = isMobile ? 'p-3' : 'p-4';
    
    return `${baseClasses} ${onlineClasses} ${highlightClasses} ${mobileClasses} ${className}`;
  }, [device.isOnline, isHighlighted, isMobile, className]);

  // Format last seen time
  const formatLastSeen = useCallback((date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }, []);

  // Handle invalid device data
  if (!device.name || device.name.trim() === '') {
    return (
      <div 
        data-testid={`device-card-${device.id}`}
        className="bg-red-50 border border-red-200 rounded-lg p-4"
      >
        <div data-testid="device-error" className="text-red-800">
          <h3 className="font-medium">Unknown Device</h3>
          <p className="text-sm">Device data is invalid or corrupted</p>
        </div>
      </div>
    );
  }

  const testId = isMobile ? 'mobile-device-card' : `device-card-${device.id}`;
  const viewType = isMobile ? 'compact-view' : 'detailed-view';

  return (
    <article
      data-testid={testId}
      className={getCardStyling()}
      role="article"
      aria-label={`${device.name} device card`}
    >
      {/* Loading overlay */}
      {isLoading && (
        <div data-testid="device-loading" className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center rounded-lg">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* Device Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate">{device.name}</h3>
          <p className="text-sm text-gray-600 truncate">{device.model}</p>
          <div data-testid="os-info" className="text-xs text-gray-500">
            {device.os} {device.osVersion}
          </div>
        </div>

        {/* Status and Battery */}
        <div className="flex items-center space-x-3">
          <div 
            data-testid={`device-status-${device.isOnline ? 'online' : 'offline'}`}
            className={`w-3 h-3 rounded-full ${device.isOnline ? 'bg-green-500' : 'bg-gray-400'}`}
            title={device.isOnline ? 'Online' : 'Offline'}
          />
          <div 
            data-testid="battery-level"
            className={`text-sm font-medium ${getBatteryStyle(device.batteryLevel)}`}
          >
            {device.batteryLevel}%
          </div>
        </div>
      </div>

      {/* Network and Connection Info */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div data-testid="network-type" className="flex items-center space-x-1">
          <span>{getNetworkDisplay(device.networkType)}</span>
        </div>
        
        {!device.isOnline && (
          <div data-testid="last-seen">
            Last seen {formatLastSeen(device.lastSeen)}
          </div>
        )}
      </div>

      {/* Offline/Connection Indicators */}
      {!device.isOnline && (
        <div data-testid="offline-indicator" className="text-xs text-gray-500 flex items-center space-x-1">
          <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
          <span>Device is offline</span>
        </div>
      )}

      {!isConnected && (
        <div data-testid="connection-error-indicator" className="text-xs text-red-500 flex items-center space-x-1">
          <span className="w-2 h-2 bg-red-500 rounded-full"></span>
          <span>Connection error</span>
        </div>
      )}

      {/* Low Battery Warning */}
      {device.batteryLevel <= 20 && (
        <div data-testid="low-battery-warning" className="bg-red-50 border border-red-200 rounded p-2">
          <p className="text-xs text-red-800">Low battery warning</p>
        </div>
      )}

      {/* Capabilities */}
      <div data-testid={viewType} className="space-y-2">
        {hasFullAccess ? (
          <div data-testid="full-access-indicator" className="inline-block">
            <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded font-medium">
              Full Access
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {device.capabilities.map(capability => (
              <span 
                key={capability}
                className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
              >
                {getCapabilityName(capability)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-2 pt-2">
        <button
          data-testid="show-details-button"
          onClick={() => onShowDetails(device)}
          onKeyDown={(e) => e.key === 'Enter' && onShowDetails(device)}
          className="flex-1 bg-blue-500 text-white text-sm py-2 rounded hover:bg-blue-600 transition-colors"
          aria-label={`View details for ${device.name}`}
        >
          Details
        </button>
        
        <button
          data-testid="edit-permissions-button"
          onClick={() => onEditPermissions(device)}
          className="flex-1 bg-gray-500 text-white text-sm py-2 rounded hover:bg-gray-600 transition-colors"
          aria-label={`Edit permissions for ${device.name}`}
        >
          Permissions
        </button>
        
        <button
          data-testid="refresh-button"
          onClick={handleRefresh}
          disabled={isLoading}
          className="px-3 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600 disabled:opacity-50 transition-colors"
          aria-label={`Refresh ${device.name}`}
        >
          {isLoading ? '⟳' : '↻'}
        </button>
        
        <button
          data-testid="unpair-button"
          onClick={() => onUnpair(device)}
          className="px-3 py-2 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors"
          aria-label={`Unpair ${device.name}`}
        >
          ✕
        </button>
      </div>

      {/* Screen reader status announcement */}
      <div 
        role="status" 
        aria-live="polite" 
        className="sr-only"
        data-testid="status-announcement"
      >
        {device.isOnline ? 'Device is online' : 'Device is offline'}
      </div>
    </article>
  );
};
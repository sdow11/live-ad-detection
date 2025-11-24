import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';

interface ConnectionDevice {
  id: string;
  deviceId: string;
  name: string;
  model: string;
  os: string;
  osVersion: string;
  isOnline: boolean;
  connectionQuality?: string | null;
  lastPing?: Date;
  lastSeen?: Date;
  batteryLevel: number;
  networkType: string;
  signalStrength?: number;
  dataUsage?: { sent: number; received: number };
  connectionDuration?: number;
  disconnectionReason?: string;
  latency?: number;
  packetLoss?: number;
}

interface DeviceConnectionStatusProps {
  device: ConnectionDevice;
  onReconnect: (device: ConnectionDevice) => void;
  onDiagnostics: (device: ConnectionDevice) => void;
  onOptimizeConnection: (device: ConnectionDevice) => void;
  showDetails?: boolean;
  className?: string;
}

export const DeviceConnectionStatus: React.FC<DeviceConnectionStatusProps> = ({
  device: initialDevice,
  onReconnect,
  onDiagnostics,
  onOptimizeConnection,
  showDetails = false,
  className = ''
}) => {
  const { subscribe, isConnected } = useWebSocket();
  const [device, setDevice] = useState(initialDevice);
  const [isMobile, setIsMobile] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [showReconnectionNotification, setShowReconnectionNotification] = useState(false);
  const [qualityChangeAnimation, setQualityChangeAnimation] = useState(false);
  const [throttledUpdate, setThrottledUpdate] = useState(false);
  const lastUpdateRef = useRef(Date.now());
  const mountedRef = useRef(true);

  // Check for mobile screen
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Throttled device update function
  const updateDeviceState = useCallback((updates: Partial<ConnectionDevice>) => {
    const now = Date.now();
    if (now - lastUpdateRef.current < 1000) { // Throttle to 1 update per second
      setThrottledUpdate(true);
      setTimeout(() => setThrottledUpdate(false), 500);
      return;
    }
    
    lastUpdateRef.current = now;
    setDevice(prev => ({ ...prev, ...updates }));
  }, []);

  // Subscribe to real-time device updates
  useEffect(() => {
    if (!isConnected || !device.id) return;

    const unsubscribeConnection = subscribe(`device.${device.id}.connection`, (update: any) => {
      if (!mountedRef.current) return;

      const wasOffline = !device.isOnline;
      updateDeviceState({
        ...update,
        lastSeen: update.lastSeen ? new Date(update.lastSeen) : device.lastSeen
      });

      if (wasOffline && update.isOnline) {
        setShowReconnectionNotification(true);
        setStatusMessage('Device reconnected successfully');
        setTimeout(() => setShowReconnectionNotification(false), 3000);
      }

      if (update.connectionQuality !== device.connectionQuality) {
        setQualityChangeAnimation(true);
        setTimeout(() => setQualityChangeAnimation(false), 1000);
      }
    });

    const unsubscribeMetrics = subscribe(`device.${device.id}.metrics`, (metrics: any) => {
      if (!mountedRef.current) return;
      updateDeviceState(metrics);
    });

    return () => {
      unsubscribeConnection();
      unsubscribeMetrics();
    };
  }, [device.id, device.isOnline, device.connectionQuality, isConnected, subscribe, updateDeviceState]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Format connection duration
  const formatDuration = useCallback((duration?: number) => {
    if (!duration) return '';
    const hours = Math.floor(duration / 3600000);
    const minutes = Math.floor((duration % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  }, []);

  // Format last seen time
  const formatLastSeen = useCallback((date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minutes ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours ago`;
    
    const days = Math.floor(hours / 24);
    return `${days} days ago`;
  }, []);

  // Format data usage
  const formatBytes = useCallback((bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }, []);

  // Get connection quality display
  const getConnectionQuality = useCallback(() => {
    if (!device.connectionQuality) return { text: 'Unknown', class: 'text-gray-500', testId: 'quality-unknown' };
    
    const qualityMap: Record<string, { text: string; class: string; testId: string }> = {
      'excellent': { text: 'Excellent', class: 'text-green-600', testId: 'quality-excellent' },
      'good': { text: 'Good', class: 'text-blue-600', testId: 'quality-good' },
      'fair': { text: 'Fair', class: 'text-yellow-600', testId: 'quality-fair' },
      'poor': { text: 'Poor', class: 'text-red-600', testId: 'quality-poor' }
    };
    
    return qualityMap[device.connectionQuality] || qualityMap['unknown'];
  }, [device.connectionQuality]);

  // Get signal strength bars
  const getSignalBars = useCallback(() => {
    const strength = device.signalStrength || 0;
    const bars = [];
    
    for (let i = 1; i <= 4; i++) {
      const isActive = i <= strength;
      const color = strength <= 1 ? 'bg-red-500' : strength <= 2 ? 'bg-yellow-500' : 'bg-green-500';
      const inactiveColor = 'bg-gray-300';
      
      bars.push(
        <div
          key={i}
          data-testid={`signal-bar-${i}`}
          className={`w-1 rounded-sm ${isActive ? color : inactiveColor} ${
            i === 1 ? 'h-2' : i === 2 ? 'h-3' : i === 3 ? 'h-4' : 'h-5'
          }`}
        />
      );
    }
    
    return bars;
  }, [device.signalStrength]);

  // Get disconnection reason display
  const getDisconnectionReason = useCallback((reason?: string) => {
    const reasonMap: Record<string, string> = {
      'network_timeout': 'Network timeout',
      'network_error': 'Network error',
      'user_disconnect': 'Manually disconnected',
      'battery_low': 'Low battery',
      'signal_lost': 'Signal lost'
    };
    
    return reason ? reasonMap[reason] || reason : 'Unknown reason';
  }, []);

  // Check if device has connection issues
  const hasConnectionIssues = useMemo(() => {
    return device.connectionQuality === 'poor' || 
           (device.signalStrength && device.signalStrength <= 1) ||
           (device.latency && device.latency > 200) ||
           (device.packetLoss && device.packetLoss > 3);
  }, [device.connectionQuality, device.signalStrength, device.latency, device.packetLoss]);

  // Check if battery affects connection
  const hasBatteryImpact = useMemo(() => {
    return device.batteryLevel <= 15 && device.connectionQuality === 'poor';
  }, [device.batteryLevel, device.connectionQuality]);

  // Handle invalid device data
  if (device.isOnline === null || device.isOnline === undefined) {
    return (
      <div data-testid="connection-data-error" className="bg-red-50 border border-red-200 rounded-lg p-3">
        <p className="text-red-800 text-sm">Unable to determine connection status</p>
      </div>
    );
  }

  const containerTestId = isMobile ? 'mobile-connection-status' : 'device-connection-status';
  const signalBarsTestId = isMobile ? 'compact-signal-bars' : 'signal-bars';
  const qualityInfo = getConnectionQuality();

  return (
    <div
      data-testid={containerTestId}
      role="status"
      aria-label="Device connection status"
      className={`bg-white rounded-lg border p-4 space-y-3 ${className}`}
    >
      <div data-testid={`connection-status-${device.id}`} className="space-y-3">
        {/* WebSocket disconnection warning */}
        {!isConnected && (
          <div data-testid="websocket-disconnected" className="bg-yellow-50 border border-yellow-200 rounded p-2">
            <p className="text-yellow-800 text-xs">Unable to get real-time updates - connection lost</p>
          </div>
        )}

        {/* Reconnection notification */}
        {showReconnectionNotification && (
          <div data-testid="reconnection-notification" className="bg-green-50 border border-green-200 rounded p-2 animate-fade-in">
            <p className="text-green-800 text-sm">Device reconnected successfully!</p>
          </div>
        )}

        {/* Throttled update indicator */}
        {throttledUpdate && (
          <div data-testid="throttled-update-indicator" className="text-xs text-gray-500">
            Updates throttled...
          </div>
        )}

        {/* Main Status Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Online/Offline Indicator */}
            <div className="flex items-center space-x-2">
              <div
                data-testid={device.isOnline ? 'online-indicator' : 'offline-indicator'}
                className={`w-3 h-3 rounded-full ${
                  device.isOnline 
                    ? 'bg-green-500 animate-pulse' 
                    : 'bg-gray-400'
                }`}
              />
              <span className="text-sm font-medium">
                {device.isOnline ? 'Online' : 'Offline'}
              </span>
            </div>

            {/* Connection Quality */}
            {device.isOnline && device.connectionQuality && (
              <div 
                data-testid="connection-quality"
                className={`transition-all duration-300 ${qualityChangeAnimation ? 'scale-110' : ''}`}
              >
                <span 
                  data-testid={qualityInfo.testId}
                  className={`text-sm ${qualityInfo.class}`}
                >
                  {qualityInfo.text}
                </span>
                {qualityChangeAnimation && (
                  <div data-testid="quality-change-animation" className="animate-pulse" />
                )}
              </div>
            )}
          </div>

          {/* Signal Strength and Network Type */}
          {device.isOnline && (
            <div className="flex items-center space-x-3">
              {/* Signal Bars */}
              <div data-testid={signalBarsTestId} className="flex items-end space-x-0.5">
                {getSignalBars()}
              </div>
              
              {/* Network Type */}
              <div className="flex items-center space-x-1">
                <div data-testid={`network-type-${device.networkType}`}>
                  {device.networkType === 'wifi' ? (
                    <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
                    </svg>
                  )}
                </div>
                <span className="text-xs text-gray-600 capitalize">
                  {device.networkType === 'wifi' ? 'WiFi' : 'Cellular'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Connection Warning for Poor Quality */}
        {hasConnectionIssues && (
          <div data-testid="connection-warning" className="bg-yellow-50 border border-yellow-200 rounded p-2">
            <div className="flex items-center space-x-2">
              <svg data-testid="warning-icon" className="w-4 h-4 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
              </svg>
              <div data-testid="unstable-connection-warning">
                <p className="text-yellow-800 text-sm">Connection is unstable</p>
              </div>
            </div>
          </div>
        )}

        {/* Battery Impact Warning */}
        {hasBatteryImpact && (
          <div data-testid="battery-impact-warning" className="bg-orange-50 border border-orange-200 rounded p-2">
            <p className="text-orange-800 text-sm">Low battery may affect connection quality</p>
          </div>
        )}

        {/* Offline Status Information */}
        {!device.isOnline && (
          <div className="space-y-2">
            {device.lastSeen && (
              <div data-testid="last-seen" className="text-sm text-gray-600">
                Last seen {formatLastSeen(device.lastSeen)}
              </div>
            )}
            
            {device.disconnectionReason && (
              <div data-testid="disconnection-reason" className="text-sm text-gray-600">
                Reason: {getDisconnectionReason(device.disconnectionReason)}
              </div>
            )}
          </div>
        )}

        {/* Connection Duration for Online Devices */}
        {device.isOnline && device.connectionDuration && (
          <div data-testid="connection-duration" className="text-sm text-gray-600">
            Connected for {formatDuration(device.connectionDuration)}
          </div>
        )}

        {/* Detailed Metrics */}
        {showDetails && device.isOnline && (
          <div data-testid="connection-metrics" className="grid grid-cols-2 gap-4 pt-3 border-t">
            {device.latency && (
              <div data-testid="latency-metric">
                <div className="text-xs text-gray-500">Latency</div>
                <div className="text-sm font-medium">{device.latency}ms</div>
              </div>
            )}
            
            {device.packetLoss !== undefined && (
              <div data-testid="packet-loss-metric">
                <div className="text-xs text-gray-500">Packet Loss</div>
                <div className="text-sm font-medium">{device.packetLoss}%</div>
              </div>
            )}
          </div>
        )}

        {/* Data Usage */}
        {showDetails && device.dataUsage && (
          <div data-testid="data-usage" className="pt-3 border-t">
            <div className="text-xs text-gray-500 mb-1">Data Usage</div>
            <div className="text-sm">
              Sent: {formatBytes(device.dataUsage.sent)} • Received: {formatBytes(device.dataUsage.received)}
            </div>
          </div>
        )}

        {/* Connection Trend Chart Placeholder */}
        {showDetails && (
          <div data-testid="connection-trend" className="pt-3 border-t">
            <div className="text-xs text-gray-500 mb-2">Connection History</div>
            <div data-testid="trend-chart" className="h-12 bg-gray-100 rounded flex items-center justify-center">
              <span className="text-xs text-gray-400">Trend Chart Placeholder</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-2 pt-3 border-t">
          {!device.isOnline && (
            <button
              data-testid="reconnect-button"
              onClick={() => onReconnect(device)}
              onKeyDown={(e) => e.key === 'Enter' && onReconnect(device)}
              className="flex-1 bg-blue-500 text-white py-2 px-3 rounded text-sm hover:bg-blue-600 transition-colors"
            >
              Reconnect
            </button>
          )}
          
          {hasConnectionIssues && (
            <>
              <button
                data-testid="diagnostics-button"
                onClick={() => onDiagnostics(device)}
                className="flex-1 bg-yellow-500 text-white py-2 px-3 rounded text-sm hover:bg-yellow-600 transition-colors"
              >
                Run Diagnostics
              </button>
              
              <button
                data-testid="optimize-button"
                onClick={() => onOptimizeConnection(device)}
                className="flex-1 bg-green-500 text-white py-2 px-3 rounded text-sm hover:bg-green-600 transition-colors"
              >
                Optimize
              </button>
            </>
          )}
        </div>

        {/* Screen reader status announcements */}
        <div 
          role="status" 
          aria-live="polite" 
          className="sr-only"
        >
          {statusMessage}
        </div>
      </div>
    </div>
  );
};
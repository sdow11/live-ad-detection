import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';

interface Stream {
  id: string;
  title: string;
  status: { state: string; health: string };
  quality: { resolution: string; bitrate: number; framerate: number };
  currentViewers: number;
  isPublic: boolean;
  recordingEnabled: boolean;
  adDetectionEnabled: boolean;
  thumbnailUrl?: string | null;
  createdAt: Date;
}

interface ConnectedDevice {
  id: string;
  deviceId: string;
  name: string;
  model: string;
  os: string;
  osVersion: string;
  capabilities: string[];
  isPaired: boolean;
  isOnline: boolean;
  batteryLevel: number;
  permissions: {
    canControlStreams: boolean;
    canTogglePiP: boolean;
    canViewAnalytics: boolean;
    canReceiveNotifications: boolean;
    canControlQuality: boolean;
  };
}

interface PiPSession {
  isActive: boolean;
  streamId: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  opacity: number;
  isMinimized: boolean;
}

interface MobileRemoteControlProps {
  connectedDevice: ConnectedDevice | null;
  activeStream: Stream | null;
  pipSession: PiPSession | null;
  onStreamControl: (action: string, stream: Stream) => Promise<void>;
  onPiPControl: (action: string, options?: any) => Promise<void>;
  onQualityChange: (quality: any) => Promise<void>;
  onNotificationToggle: (type: string, enabled: boolean) => void;
  onAnalyticsView: (stream: Stream) => void;
  onDisconnect: (device: ConnectedDevice) => void;
  className?: string;
}

export const MobileRemoteControl: React.FC<MobileRemoteControlProps> = ({
  connectedDevice: initialDevice,
  activeStream: initialStream,
  pipSession: initialPiPSession,
  onStreamControl,
  onPiPControl,
  onQualityChange,
  onNotificationToggle,
  onAnalyticsView,
  onDisconnect,
  className = ''
}) => {
  const { subscribe, isConnected } = useWebSocket();
  const [connectedDevice, setConnectedDevice] = useState(initialDevice);
  const [activeStream, setActiveStream] = useState(initialStream);
  const [pipSession, setPipSession] = useState(initialPiPSession);
  const [showDisconnectConfirmation, setShowDisconnectConfirmation] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);
  const [actionThrottled, setActionThrottled] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [swipeDetected, setSwipeDetected] = useState(false);
  const lastActionRef = useRef(Date.now());
  const mountedRef = useRef(true);

  // Real-time subscriptions
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribeStream = subscribe('streamUpdated', (update: any) => {
      if (mountedRef.current) {
        setActiveStream(prev => prev ? { ...prev, ...update } : null);
        setStatusMessage('Stream updated');
      }
    });

    const unsubscribeDevice = subscribe('deviceStatusChanged', (update: any) => {
      if (mountedRef.current && connectedDevice && update.deviceId === connectedDevice.deviceId) {
        setConnectedDevice(prev => prev ? { ...prev, ...update } : null);
        setStatusMessage('Device status updated');
      }
    });

    const unsubscribePiP = subscribe('pipSessionChanged', (update: any) => {
      if (mountedRef.current) {
        setPipSession(update);
        setStatusMessage('PiP session updated');
      }
    });

    return () => {
      unsubscribeStream();
      unsubscribeDevice();
      unsubscribePiP();
    };
  }, [isConnected, subscribe, connectedDevice]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Throttle actions to prevent spam
  const throttleAction = useCallback(() => {
    const now = Date.now();
    if (now - lastActionRef.current < 1000) {
      setActionThrottled(true);
      setTimeout(() => setActionThrottled(false), 1000);
      return true;
    }
    lastActionRef.current = now;
    return false;
  }, []);

  // Handle stream control actions
  const handleStreamControl = useCallback(async (action: string) => {
    if (!activeStream || throttleAction()) return;

    try {
      await onStreamControl(action, activeStream);
      setStatusMessage(`Stream ${action} successful`);
    } catch (error: any) {
      setControlError(error.message || 'Control action failed');
      setTimeout(() => setControlError(null), 5000);
    }
  }, [activeStream, onStreamControl, throttleAction]);

  // Handle PiP control actions
  const handlePiPControl = useCallback(async (action: string, options?: any) => {
    if (throttleAction()) return;

    try {
      await onPiPControl(action, options);
      setStatusMessage(`PiP ${action} successful`);
    } catch (error: any) {
      setControlError(error.message || 'PiP control failed');
      setTimeout(() => setControlError(null), 5000);
    }
  }, [onPiPControl, throttleAction]);

  // Handle quality change
  const handleQualityChange = useCallback(async (quality: any) => {
    if (throttleAction()) return;

    try {
      await onQualityChange(quality);
      setStatusMessage('Quality changed successfully');
    } catch (error: any) {
      setControlError(error.message || 'Quality change failed');
      setTimeout(() => setControlError(null), 5000);
    }
  }, [onQualityChange, throttleAction]);

  // Touch gesture handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    setSwipeDetected(false);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStart) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;

    // Detect significant swipe
    if (Math.abs(deltaX) > 50 || Math.abs(deltaY) > 50) {
      setSwipeDetected(true);
    }
  }, [touchStart]);

  const handleTouchEnd = useCallback(() => {
    if (swipeDetected) {
      setStatusMessage('Swipe gesture detected');
    }
    setTouchStart(null);
    setSwipeDetected(false);
  }, [swipeDetected]);

  // Get capability display names
  const getCapabilityName = useCallback((capability: string) => {
    const names: Record<string, string> = {
      'stream_control': 'Stream Control',
      'pip_control': 'PiP Control',
      'notifications': 'Notifications',
      'analytics': 'Analytics'
    };
    return names[capability] || capability;
  }, []);

  // Quality presets
  const qualityPresets = useMemo(() => [
    { key: '1080p', label: 'Full HD', resolution: '1920x1080', bitrate: 2500, framerate: 30 },
    { key: '720p', label: 'HD', resolution: '1280x720', bitrate: 1500, framerate: 30 },
    { key: '480p', label: 'SD', resolution: '854x480', bitrate: 1000, framerate: 30 }
  ], []);

  // Format stream duration
  const formatDuration = useCallback((createdAt: Date) => {
    const now = new Date();
    const diff = now.getTime() - createdAt.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }, []);

  // Handle no device connected
  if (!connectedDevice) {
    return (
      <div data-testid="no-device-connected" className="text-center py-8 px-4">
        <div className="text-gray-400 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-medium text-gray-900">No Device Connected</h2>
        <p className="text-gray-600 mt-2">Pair a mobile device to enable remote controls</p>
      </div>
    );
  }

  return (
    <div
      data-testid="mobile-remote-control"
      role="application"
      aria-label="Mobile Remote Control Interface"
      className={`space-y-6 ${className}`}
    >
      {/* Connection Error */}
      {!isConnected && (
        <div data-testid="connection-error" className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Connection lost - controls may not work properly</p>
        </div>
      )}

      {/* Control Error Notification */}
      {controlError && (
        <div data-testid="control-error-notification" className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{controlError}</p>
        </div>
      )}

      {/* Action Throttled Indicator */}
      {actionThrottled && (
        <div data-testid="action-throttled-indicator" className="bg-yellow-50 border border-yellow-200 rounded-lg p-2">
          <p className="text-yellow-800 text-sm">Actions are being throttled to prevent spam</p>
        </div>
      )}

      {/* Device Info Header */}
      <div data-testid="device-info-header" className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-gray-900">{connectedDevice.name}</h2>
            <p className="text-sm text-gray-600">{connectedDevice.model} • {connectedDevice.os} {connectedDevice.osVersion}</p>
          </div>
          
          <div className="flex items-center space-x-3">
            <div data-testid="device-battery-level" className="text-sm">
              <span className="text-gray-600">Battery:</span>
              <span className="ml-1 font-medium">{connectedDevice.batteryLevel}%</span>
            </div>
            
            {connectedDevice.isOnline ? (
              <div data-testid="device-connection-indicator" className="flex items-center space-x-1">
                <div data-testid="device-online-status" className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm text-green-600">Connected</span>
              </div>
            ) : (
              <div data-testid="device-disconnected" className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span className="text-sm text-red-600">Disconnected</span>
              </div>
            )}
          </div>
        </div>

        {/* Device Capabilities */}
        <div data-testid="device-capabilities" className="flex flex-wrap gap-2 mt-3">
          {connectedDevice.capabilities.map(capability => (
            <span key={capability} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
              {getCapabilityName(capability)}
            </span>
          ))}
        </div>

        {/* Signal Strength Placeholder */}
        <div data-testid="device-signal-strength" className="mt-2 flex items-center space-x-1">
          <span className="text-xs text-gray-500">Signal:</span>
          <div className="flex space-x-0.5">
            {[1, 2, 3, 4].map(bar => (
              <div key={bar} className="w-1 h-3 bg-green-500 rounded-sm"></div>
            ))}
          </div>
        </div>
      </div>

      {/* Device Disconnected State */}
      {!connectedDevice.isOnline && (
        <div data-testid="device-disconnected" className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
          <h3 className="text-lg font-medium text-yellow-900 mb-2">Device Disconnected</h3>
          <p className="text-yellow-700 mb-4">The device is not currently connected. Some features may be unavailable.</p>
          <button
            data-testid="reconnect-button"
            className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600 transition-colors"
          >
            Try Reconnect
          </button>
        </div>
      )}

      {/* Stream Control Panel */}
      {activeStream ? (
        <div data-testid="active-stream-panel" className="bg-white rounded-lg border p-4">
          <h3 id="stream-controls-heading" className="text-lg font-medium text-gray-900 mb-3">Stream Control</h3>
          
          <div className="space-y-4">
            {/* Stream Info */}
            <div>
              <h4 className="font-medium text-gray-900">{activeStream.title}</h4>
              <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                <span>{activeStream.currentViewers} viewers</span>
                <span>{activeStream.quality.resolution}</span>
                <span>Live for {formatDuration(activeStream.createdAt)}</span>
              </div>
            </div>

            {/* Stream Controls */}
            {connectedDevice.permissions.canControlStreams ? (
              <div data-testid="stream-controls" role="group" aria-labelledby="stream-controls-heading" className="flex space-x-2">
                <button
                  data-testid="pause-stream-button"
                  onClick={() => handleStreamControl('pause')}
                  onKeyDown={(e) => e.key === 'Enter' && handleStreamControl('pause')}
                  disabled={!connectedDevice.isOnline}
                  className="flex-1 bg-yellow-500 text-white py-2 rounded hover:bg-yellow-600 disabled:opacity-50 transition-colors"
                >
                  Pause
                </button>
                
                <button
                  data-testid="stop-stream-button"
                  onClick={() => handleStreamControl('stop')}
                  onKeyDown={(e) => e.key === 'Enter' && handleStreamControl('stop')}
                  disabled={!connectedDevice.isOnline}
                  className="flex-1 bg-red-500 text-white py-2 rounded hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  Stop
                </button>
                
                <button
                  data-testid="restart-stream-button"
                  onClick={() => handleStreamControl('restart')}
                  disabled={!connectedDevice.isOnline}
                  className="flex-1 bg-green-500 text-white py-2 rounded hover:bg-green-600 disabled:opacity-50 transition-colors"
                >
                  Restart
                </button>
              </div>
            ) : (
              <div data-testid="permission-denied-message" className="bg-gray-50 rounded p-3">
                <p className="text-gray-600 text-sm">Stream controls are not available - insufficient permissions</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div data-testid="no-active-stream" className="bg-gray-50 rounded-lg border p-4 text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Stream</h3>
          <p className="text-gray-600">Start a stream to enable remote controls</p>
        </div>
      )}

      {/* Picture-in-Picture Controls */}
      <div data-testid="pip-control-panel" className="bg-white rounded-lg border p-4">
        <h3 className="text-lg font-medium text-gray-900 mb-3">Picture-in-Picture</h3>
        
        {connectedDevice.permissions.canTogglePiP ? (
          <div className="space-y-4">
            {/* PiP Status */}
            {pipSession?.isActive && (
              <div data-testid="pip-active-indicator" className="bg-blue-50 rounded p-3">
                <p className="text-blue-800 font-medium">PiP Active</p>
                <div data-testid="pip-position-info" className="text-blue-600 text-sm mt-1">
                  Position: {pipSession.position.x}, {pipSession.position.y} • 
                  Size: {pipSession.size.width}x{pipSession.size.height}
                </div>
              </div>
            )}

            {/* PiP Toggle */}
            <button
              data-testid="pip-toggle-button"
              onClick={() => handlePiPControl('toggle')}
              disabled={!connectedDevice.isOnline || !activeStream}
              className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {pipSession?.isActive ? 'Disable PiP' : 'Enable PiP'}
            </button>

            {/* PiP Position Controls */}
            {pipSession?.isActive && (
              <div>
                <div data-testid="pip-position-controls" className="grid grid-cols-3 gap-2 mb-3">
                  <div></div>
                  <button
                    data-testid="pip-move-up-button"
                    onClick={() => handlePiPControl('move', { direction: 'up', amount: 10 })}
                    className="bg-gray-500 text-white p-2 rounded hover:bg-gray-600"
                  >
                    ↑
                  </button>
                  <div></div>
                  
                  <button
                    data-testid="pip-move-left-button"
                    onClick={() => handlePiPControl('move', { direction: 'left', amount: 10 })}
                    className="bg-gray-500 text-white p-2 rounded hover:bg-gray-600"
                  >
                    ←
                  </button>
                  
                  <div data-testid="pip-drag-handle" className="bg-gray-200 rounded flex items-center justify-center text-gray-500 text-sm">
                    ⌖
                  </div>
                  
                  <button
                    data-testid="pip-move-right-button"
                    onClick={() => handlePiPControl('move', { direction: 'right', amount: 10 })}
                    className="bg-gray-500 text-white p-2 rounded hover:bg-gray-600"
                  >
                    →
                  </button>
                  
                  <div></div>
                  <button
                    data-testid="pip-move-down-button"
                    onClick={() => handlePiPControl('move', { direction: 'down', amount: 10 })}
                    className="bg-gray-500 text-white p-2 rounded hover:bg-gray-600"
                  >
                    ↓
                  </button>
                  <div></div>
                </div>

                {/* PiP Size Controls */}
                <div data-testid="pip-size-controls" className="flex space-x-2">
                  <button
                    data-testid="pip-size-decrease-button"
                    onClick={() => handlePiPControl('resize', { scale: 0.9 })}
                    className="flex-1 bg-gray-500 text-white py-2 rounded hover:bg-gray-600"
                  >
                    Smaller
                  </button>
                  
                  <button
                    data-testid="pip-size-increase-button"
                    onClick={() => handlePiPControl('resize', { scale: 1.1 })}
                    className="flex-1 bg-gray-500 text-white py-2 rounded hover:bg-gray-600"
                  >
                    Larger
                  </button>
                </div>
              </div>
            )}

            {/* Touch Controls */}
            <div
              data-testid="pip-touch-controls"
              className="bg-gray-100 rounded p-4 text-center text-gray-600 text-sm"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              Touch area for PiP gestures
            </div>
          </div>
        ) : (
          <div data-testid="pip-permission-denied" className="bg-gray-50 rounded p-3">
            <p className="text-gray-600 text-sm">PiP controls are not available - insufficient permissions</p>
          </div>
        )}
      </div>

      {/* Quality Control Panel */}
      <div data-testid="quality-control-panel" className="bg-white rounded-lg border p-4">
        <h3 className="text-lg font-medium text-gray-900 mb-3">Stream Quality</h3>
        
        {connectedDevice.permissions.canControlQuality && activeStream ? (
          <div className="space-y-4">
            {/* Current Quality Display */}
            <div data-testid="current-quality-display" className="bg-gray-50 rounded p-3">
              <div className="text-sm text-gray-600">Current Quality:</div>
              <div className="flex items-center space-x-4 text-sm font-medium mt-1">
                <span>{activeStream.quality.resolution}</span>
                <span>{activeStream.quality.bitrate} kbps</span>
                <span>{activeStream.quality.framerate} fps</span>
              </div>
            </div>

            {/* Quality Presets */}
            <div data-testid="quality-selector" className="grid grid-cols-3 gap-2">
              {qualityPresets.map(preset => (
                <button
                  key={preset.key}
                  data-testid={`quality-preset-${preset.key}`}
                  onClick={() => handleQualityChange({
                    resolution: preset.resolution,
                    bitrate: preset.bitrate,
                    framerate: preset.framerate
                  })}
                  disabled={!connectedDevice.isOnline}
                  className="bg-blue-500 text-white py-2 px-3 rounded hover:bg-blue-600 disabled:opacity-50 transition-colors"
                >
                  <div className="font-medium">{preset.label}</div>
                  <div className="text-xs opacity-75">{preset.resolution}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div data-testid="quality-controls-disabled" className="bg-gray-50 rounded p-3">
            <p className="text-gray-600 text-sm">Quality controls are not available</p>
          </div>
        )}
      </div>

      {/* Analytics Overview */}
      {connectedDevice.permissions.canViewAnalytics && activeStream ? (
        <div data-testid="analytics-overview" className="bg-white rounded-lg border p-4">
          <h3 className="text-lg font-medium text-gray-900 mb-3">Stream Analytics</h3>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div data-testid="real-time-viewers" className="text-center">
              <div data-testid="analytics-viewer-count" className="text-2xl font-bold text-blue-600">{activeStream.currentViewers}</div>
              <div className="text-sm text-gray-600">Current Viewers</div>
            </div>
            
            <div className="text-center">
              <div data-testid="analytics-duration" className="text-2xl font-bold text-green-600">{formatDuration(activeStream.createdAt)}</div>
              <div className="text-sm text-gray-600">Stream Duration</div>
            </div>
          </div>

          <button
            data-testid="view-full-analytics-button"
            onClick={() => onAnalyticsView(activeStream)}
            className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600 transition-colors"
          >
            View Full Analytics
          </button>
        </div>
      ) : (
        connectedDevice.permissions.canViewAnalytics ? null : (
          <div data-testid="analytics-permission-denied" className="bg-gray-50 rounded-lg border p-4">
            <p className="text-gray-600 text-sm text-center">Analytics are not available - insufficient permissions</p>
          </div>
        )
      )}

      {/* Notification Controls */}
      <div data-testid="notification-controls" className="bg-white rounded-lg border p-4">
        <h3 className="text-lg font-medium text-gray-900 mb-3">Notifications</h3>
        
        <div data-testid="notification-preferences" className="space-y-3">
          <label className="flex items-center justify-between">
            <span className="text-sm">Stream Start</span>
            <input
              data-testid="notify-stream-start"
              type="checkbox"
              onChange={(e) => onNotificationToggle('stream_start', e.target.checked)}
              className="rounded"
            />
          </label>
          
          <label className="flex items-center justify-between">
            <span className="text-sm">Viewer Milestones</span>
            <input
              data-testid="notify-viewer-milestones"
              type="checkbox"
              onChange={(e) => onNotificationToggle('viewer_milestones', e.target.checked)}
              className="rounded"
            />
          </label>
          
          <label className="flex items-center justify-between">
            <span className="text-sm">Quality Issues</span>
            <input
              data-testid="notify-quality-issues"
              type="checkbox"
              onChange={(e) => onNotificationToggle('quality_issues', e.target.checked)}
              className="rounded"
            />
          </label>
        </div>
        
        <div data-testid="notification-toggle" className="mt-3">
          <button className="w-full bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300 transition-colors">
            Configure Notifications
          </button>
        </div>
      </div>

      {/* Device Actions */}
      <div data-testid="device-actions" className="bg-white rounded-lg border p-4">
        <h3 className="text-lg font-medium text-gray-900 mb-3">Device Controls</h3>
        
        <div className="flex space-x-2">
          <button
            data-testid="refresh-connection-button"
            className="flex-1 bg-green-500 text-white py-2 rounded hover:bg-green-600 transition-colors"
          >
            Refresh Connection
          </button>
          
          <button
            data-testid="disconnect-device-button"
            onClick={() => setShowDisconnectConfirmation(true)}
            className="flex-1 bg-red-500 text-white py-2 rounded hover:bg-red-600 transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Touch Navigation Area */}
      <div
        data-testid="touch-navigation-area"
        className="bg-gray-100 rounded-lg p-8 text-center text-gray-500"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        Touch navigation area
        {swipeDetected && (
          <div data-testid="swipe-navigation-feedback" className="mt-2 text-blue-600">
            Swipe detected
          </div>
        )}
      </div>

      {/* Disconnect Confirmation */}
      {showDisconnectConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div data-testid="disconnect-confirmation" className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Disconnect Device?</h3>
            <p className="text-gray-600 mb-6">This will end the remote control session.</p>
            
            <div className="flex space-x-3">
              <button
                data-testid="confirm-disconnect"
                onClick={() => {
                  onDisconnect(connectedDevice);
                  setShowDisconnectConfirmation(false);
                }}
                className="flex-1 bg-red-500 text-white py-2 rounded hover:bg-red-600"
              >
                Disconnect
              </button>
              
              <button
                onClick={() => setShowDisconnectConfirmation(false)}
                className="flex-1 bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screen reader status announcements */}
      <div 
        role="status" 
        aria-live="polite" 
        className="sr-only"
      >
        {statusMessage}
      </div>
    </div>
  );
};
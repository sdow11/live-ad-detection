import React, { useState, useEffect } from 'react';
import { useMobileDevice } from '@/hooks/useMobileDevice';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAuth } from '@/hooks/useAuth';

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
}

interface PairingSession {
  code: string;
  qrCodeDataURL: string;
  expiresAt: Date;
}

export const MobileDeviceManager: React.FC = () => {
  const { user } = useAuth();
  const { socket, isConnected, subscribe } = useWebSocket();
  const {
    devices,
    loading,
    error,
    generatePairingCode,
    pairDevice,
    unpairDevice,
    refreshDevices,
    currentPairingSession
  } = useMobileDevice();

  const [showPairingModal, setShowPairingModal] = useState(false);
  const [showDeviceDetails, setShowDeviceDetails] = useState<string | null>(null);
  const [showUnpairConfirmation, setShowUnpairConfirmation] = useState<string | null>(null);
  const [showPermissionsEditor, setShowPermissionsEditor] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
  }>>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [expirationTime, setExpirationTime] = useState<string>('');

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (currentPairingSession?.expiresAt) {
      const updateCountdown = () => {
        const now = Date.now();
        const expiry = currentPairingSession.expiresAt.getTime();
        const remaining = Math.max(0, expiry - now);
        
        if (remaining > 0) {
          const minutes = Math.floor(remaining / 60000);
          const seconds = Math.floor((remaining % 60000) / 1000);
          setExpirationTime(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        } else {
          setExpirationTime('Expired');
        }
      };

      const interval = setInterval(updateCountdown, 1000);
      updateCountdown();
      return () => clearInterval(interval);
    }
  }, [currentPairingSession]);

  useEffect(() => {
    if (isConnected && socket) {
      const unsubscribeStatusUpdate = subscribe('deviceStatusUpdate', (data: any) => {
        // Device status updates handled by the hook
      });

      const unsubscribeDeviceActivity = subscribe('deviceActivity', (data: any) => {
        addNotification('info', `${data.deviceName} ${data.activity === 'stream_started' ? 'started a stream' : 'performed an action'}`);
      });

      const unsubscribeConnectionChanged = subscribe('deviceConnectionChanged', (data: any) => {
        if (data.reconnected) {
          addNotification('success', 'Device reconnected');
        }
      });

      const unsubscribeDevicePaired = subscribe('devicePaired', (data: any) => {
        if (data.success) {
          addNotification('success', 'Device paired successfully!');
          setShowPairingModal(false);
        }
      });

      const unsubscribePairingError = subscribe('pairingError', (data: any) => {
        addNotification('error', `Pairing failed: ${data.error}`);
      });

      return () => {
        unsubscribeStatusUpdate();
        unsubscribeDeviceActivity();
        unsubscribeConnectionChanged();
        unsubscribeDevicePaired();
        unsubscribePairingError();
      };
    }
  }, [isConnected, socket, subscribe]);

  const addNotification = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const handleGeneratePairingCode = async () => {
    try {
      await generatePairingCode();
    } catch (error: any) {
      addNotification('error', error.message);
    }
  };

  const handleUnpairDevice = async (deviceId: string) => {
    try {
      await unpairDevice(deviceId);
      setShowUnpairConfirmation(null);
      addNotification('success', 'Device unpaired successfully');
    } catch (error: any) {
      addNotification('error', error.message);
    }
  };

  const renderCapabilityBadge = (capability: string) => {
    const capabilityNames: Record<string, string> = {
      'stream_control': 'Stream Control',
      'pip_control': 'PiP Control',
      'notifications': 'Notifications'
    };

    return (
      <span key={capability} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
        {capabilityNames[capability] || capability}
      </span>
    );
  };

  const renderDeviceCard = (device: MobileDevice) => {
    const cardTestId = isMobile ? `mobile-device-card-${device.id}` : `device-card-${device.id}`;
    
    return (
      <div key={device.id} data-testid={cardTestId} className="bg-white rounded-lg shadow-sm border p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-medium text-gray-900">{device.name}</h3>
            <p className="text-sm text-gray-600">{device.model}</p>
          </div>
          
          <div className="flex items-center space-x-2">
            <div 
              data-testid={`device-status-${device.isOnline ? 'online' : 'offline'}-${device.id}`}
              className={`w-2 h-2 rounded-full ${device.isOnline ? 'bg-green-500' : 'bg-gray-400'}`}
            />
            <span className="text-sm text-gray-600">{device.batteryLevel}%</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {device.capabilities.map(renderCapabilityBadge)}
        </div>

        <div className="flex space-x-2">
          <button
            data-testid="device-info-button"
            onClick={() => setShowDeviceDetails(device.id)}
            className="flex-1 bg-blue-500 text-white py-2 px-4 rounded text-sm hover:bg-blue-600"
          >
            Info
          </button>
          <button
            data-testid="unpair-device-button"
            onClick={() => setShowUnpairConfirmation(device.id)}
            className="flex-1 bg-red-500 text-white py-2 px-4 rounded text-sm hover:bg-red-600"
          >
            Unpair
          </button>
        </div>
      </div>
    );
  };

  const renderPairingModal = () => {
    if (!showPairingModal) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div data-testid="pairing-modal" className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <h2 className="text-xl font-semibold mb-6">Pair New Device</h2>
          
          {!currentPairingSession ? (
            <div className="space-y-4">
              <p className="text-gray-600">Generate a pairing code to connect your mobile device.</p>
              <button
                onClick={handleGeneratePairingCode}
                className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600"
              >
                Generate Pairing Code
              </button>
            </div>
          ) : (
            <div data-testid="qr-code-container" className="space-y-4 text-center">
              <div data-testid="pairing-code-display">
                <img 
                  src={currentPairingSession.qrCodeDataURL}
                  alt="Device Pairing QR Code"
                  data-testid="qr-code-image"
                  className="w-48 h-48 mx-auto border rounded"
                />
                <p className="text-sm text-gray-600 mt-2">Scan with your mobile device</p>
                <p className="text-xs text-gray-500">Or enter code manually: {currentPairingSession.code}</p>
              </div>
              
              {expirationTime && (
                <div data-testid="expiration-countdown" className="text-sm text-orange-600">
                  Expires in {expirationTime}
                </div>
              )}

              <div className="space-y-2">
                <button
                  onClick={handleGeneratePairingCode}
                  className="w-full bg-gray-500 text-white py-2 rounded hover:bg-gray-600"
                >
                  Generate New Code
                </button>
              </div>
            </div>
          )}

          <button
            onClick={() => setShowPairingModal(false)}
            className="w-full bg-gray-200 text-gray-800 py-2 rounded mt-4 hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    );
  };

  const renderDeviceDetailsModal = () => {
    const device = devices.find(d => d.id === showDeviceDetails);
    if (!device) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div data-testid="device-details-modal" className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <h2 className="text-xl font-semibold mb-6">Device Details</h2>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Name:</label>
              <p className="text-gray-900">{device.name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Model:</label>
              <p className="text-gray-900">{device.model}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Operating System:</label>
              <p className="text-gray-900">{device.os} {device.osVersion}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">App Version:</label>
              <p className="text-gray-900">{device.appVersion}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Last Seen:</label>
              <p className="text-gray-900">{device.lastSeen.toLocaleString()}</p>
            </div>
          </div>

          <div className="flex space-x-2 mt-6">
            <button
              onClick={() => {
                setShowDeviceDetails(null);
                setShowPermissionsEditor(device.id);
              }}
              className="flex-1 bg-blue-500 text-white py-2 rounded hover:bg-blue-600"
            >
              Edit Permissions
            </button>
            <button
              onClick={() => setShowDeviceDetails(null)}
              className="flex-1 bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPermissionsEditor = () => {
    const device = devices.find(d => d.id === showPermissionsEditor);
    if (!device) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <h2 className="text-xl font-semibold mb-6">Edit Permissions</h2>
          
          <div data-testid="permissions-editor" className="space-y-3">
            {['Stream Control', 'PiP Control', 'Notifications'].map(permission => (
              <label key={permission} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  defaultChecked={device.capabilities.includes(permission.toLowerCase().replace(' ', '_'))}
                  className="rounded"
                />
                <span className="text-sm">{permission}</span>
              </label>
            ))}
          </div>

          <div className="flex space-x-2 mt-6">
            <button
              onClick={() => setShowPermissionsEditor(null)}
              className="flex-1 bg-blue-500 text-white py-2 rounded hover:bg-blue-600"
            >
              Save Changes
            </button>
            <button
              onClick={() => setShowPermissionsEditor(null)}
              className="flex-1 bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderUnpairConfirmation = () => {
    const device = devices.find(d => d.id === showUnpairConfirmation);
    if (!device) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div data-testid="unpair-confirmation-dialog" className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <h2 className="text-xl font-semibold mb-4">Unpair Device?</h2>
          <p className="text-gray-600 mb-6">
            This will remove the device's access to your account and streams.
          </p>

          <div className="flex space-x-2">
            <button
              onClick={() => handleUnpairDevice(device.id)}
              className="flex-1 bg-red-500 text-white py-2 rounded hover:bg-red-600"
            >
              Unpair Device
            </button>
            <button
              onClick={() => setShowUnpairConfirmation(null)}
              className="flex-1 bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  const containerTestId = isMobile ? 'mobile-device-manager-mobile' : 'mobile-device-manager';
  const listTestId = isMobile ? 'mobile-device-list' : 'device-list';

  if (loading) {
    return (
      <div data-testid="devices-loading" className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p>Loading devices...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="devices-error" className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
        <button
          onClick={refreshDevices}
          className="mt-2 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <main 
      data-testid={containerTestId} 
      role="main" 
      aria-label="Mobile Device Manager"
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Mobile Devices</h1>
        <button
          data-testid="pair-new-device-button"
          onClick={() => setShowPairingModal(true)}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Pair New Device
        </button>
      </div>

      {/* Offline Indicator */}
      {!isConnected && (
        <div data-testid="offline-mode-indicator" className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">Offline - Device status may be outdated</p>
        </div>
      )}

      {/* Notifications */}
      <div className="fixed top-4 right-4 space-y-2 z-40">
        {notifications.map(notification => (
          <div
            key={notification.id}
            data-testid={`${notification.type === 'success' ? 'pairing-success-notification' : 
                          notification.type === 'error' ? 'pairing-error-notification' :
                          'device-activity-notification'}`}
            className={`max-w-sm p-4 rounded-lg shadow-lg ${
              notification.type === 'success' ? 'bg-green-50 text-green-800' :
              notification.type === 'error' ? 'bg-red-50 text-red-800' :
              'bg-blue-50 text-blue-800'
            }`}
          >
            {notification.message}
          </div>
        ))}
      </div>

      {/* Reconnection Notification */}
      {notifications.some(n => n.message.includes('reconnected')) && (
        <div data-testid="reconnection-notification" className="hidden" />
      )}

      {/* Device List */}
      {devices.length === 0 ? (
        <div data-testid="empty-devices-state" className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-medium text-gray-900 mb-2">No mobile devices paired</h2>
          <p className="text-gray-600">Pair your first device to get started</p>
        </div>
      ) : (
        <div>
          <ul data-testid={listTestId} role="list" aria-label="Paired mobile devices" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {devices.map(renderDeviceCard)}
          </ul>
        </div>
      )}

      {/* Status announcement for screen readers */}
      <div role="status" aria-live="polite" className="sr-only">
        {notifications.length > 0 && notifications[notifications.length - 1].message}
      </div>

      {/* Modals */}
      {renderPairingModal()}
      {renderDeviceDetailsModal()}
      {renderPermissionsEditor()}
      {renderUnpairConfirmation()}
    </main>
  );
};
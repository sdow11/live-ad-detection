import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MobileDeviceManager } from '@/components/MobileDeviceManager';
import { AuthProvider } from '@/contexts/AuthContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';
import { MobileDeviceProvider } from '@/contexts/MobileDeviceContext';

// TDD Phase 1: RED - Write failing tests for Mobile Device Pairing UI
// Following SOLID principles and comprehensive mobile device management testing

// Mock dependencies
jest.mock('@/hooks/useMobileDevice');
jest.mock('@/hooks/useWebSocket');
jest.mock('@/hooks/useAuth');
jest.mock('@/services/MobileAuthService');

const mockUseMobileDevice = jest.fn();
const mockUseWebSocket = jest.fn();
const mockUseAuth = jest.fn();

require('@/hooks/useMobileDevice').useMobileDevice = mockUseMobileDevice;
require('@/hooks/useWebSocket').useWebSocket = mockUseWebSocket;
require('@/hooks/useAuth').useAuth = mockUseAuth;

// Test wrapper with providers
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>
    <WebSocketProvider>
      <MobileDeviceProvider>
        {children}
      </MobileDeviceProvider>
    </WebSocketProvider>
  </AuthProvider>
);

describe('MobileDeviceManager (TDD)', () => {
  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com'
  };

  const mockPairedDevices = [
    {
      id: 'device-1',
      deviceId: 'mobile-device-1',
      name: 'iPhone 15 Pro',
      model: 'iPhone15,3',
      os: 'iOS',
      osVersion: '17.2',
      appVersion: '1.0.0',
      capabilities: ['stream_control', 'pip_control', 'notifications'],
      isPaired: true,
      isOnline: true,
      lastSeen: new Date(),
      batteryLevel: 85,
      networkType: 'wifi'
    },
    {
      id: 'device-2',
      deviceId: 'mobile-device-2', 
      name: 'Samsung Galaxy S24',
      model: 'SM-S921B',
      os: 'Android',
      osVersion: '14',
      appVersion: '1.0.0',
      capabilities: ['stream_control', 'notifications'],
      isPaired: true,
      isOnline: false,
      lastSeen: new Date(Date.now() - 300000), // 5 minutes ago
      batteryLevel: 45,
      networkType: 'cellular'
    }
  ];

  const mockDefaultWebSocket = {
    socket: null,
    isConnected: true,
    emit: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn()
  };

  const mockDefaultMobileDevice = {
    devices: mockPairedDevices,
    loading: false,
    error: null,
    generatePairingCode: jest.fn(),
    pairDevice: jest.fn(),
    unpairDevice: jest.fn(),
    refreshDevices: jest.fn(),
    currentPairingSession: null
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAuth.mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      login: jest.fn(),
      logout: jest.fn(),
      loading: false
    });

    mockUseWebSocket.mockReturnValue(mockDefaultWebSocket);
    mockUseMobileDevice.mockReturnValue(mockDefaultMobileDevice);
  });

  describe('Device List Display', () => {
    it('should render mobile device manager with device list', async () => {
      // RED: This test will fail because component doesn't exist yet
      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      expect(screen.getByTestId('mobile-device-manager')).toBeInTheDocument();
      expect(screen.getByTestId('device-list')).toBeInTheDocument();
      expect(screen.getByText('Mobile Devices')).toBeInTheDocument();
    });

    it('should display paired devices with status indicators', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      expect(screen.getByText('iPhone 15 Pro')).toBeInTheDocument();
      expect(screen.getByText('Samsung Galaxy S24')).toBeInTheDocument();

      // Check online status
      expect(screen.getByTestId('device-status-online-device-1')).toBeInTheDocument();
      expect(screen.getByTestId('device-status-offline-device-2')).toBeInTheDocument();

      // Check battery levels
      expect(screen.getByText('85%')).toBeInTheDocument();
      expect(screen.getByText('45%')).toBeInTheDocument();
    });

    it('should show device capabilities and permissions', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      const device1Card = screen.getByTestId('device-card-device-1');
      
      expect(within(device1Card).getByText('Stream Control')).toBeInTheDocument();
      expect(within(device1Card).getByText('PiP Control')).toBeInTheDocument();
      expect(within(device1Card).getByText('Notifications')).toBeInTheDocument();
    });

    it('should display empty state when no devices are paired', async () => {
      // RED: This test will fail
      mockUseMobileDevice.mockReturnValue({
        ...mockDefaultMobileDevice,
        devices: []
      });

      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      expect(screen.getByTestId('empty-devices-state')).toBeInTheDocument();
      expect(screen.getByText('No mobile devices paired')).toBeInTheDocument();
      expect(screen.getByText('Pair your first device to get started')).toBeInTheDocument();
    });

    it('should show loading state when devices are being fetched', async () => {
      // RED: This test will fail
      mockUseMobileDevice.mockReturnValue({
        ...mockDefaultMobileDevice,
        loading: true,
        devices: []
      });

      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      expect(screen.getByTestId('devices-loading')).toBeInTheDocument();
      expect(screen.getByText('Loading devices...')).toBeInTheDocument();
    });
  });

  describe('Device Pairing Flow', () => {
    it('should show pair new device button and open pairing modal', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      const pairButton = screen.getByTestId('pair-new-device-button');
      expect(pairButton).toBeInTheDocument();

      fireEvent.click(pairButton);
      expect(screen.getByTestId('pairing-modal')).toBeInTheDocument();
    });

    it('should generate pairing code and display QR code', async () => {
      // RED: This test will fail
      const mockGeneratePairingCode = jest.fn().mockResolvedValue({
        code: 'ABC123',
        qrCodeDataURL: 'data:image/png;base64,mockqrcode',
        expiresAt: new Date(Date.now() + 300000)
      }) as any;

      mockUseMobileDevice.mockReturnValue({
        ...mockDefaultMobileDevice,
        generatePairingCode: mockGeneratePairingCode
      });

      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('pair-new-device-button'));
      fireEvent.click(screen.getByText('Generate Pairing Code'));

      await waitFor(() => {
        expect(screen.getByTestId('pairing-code-display')).toBeInTheDocument();
        expect(screen.getByText('ABC123')).toBeInTheDocument();
        expect(screen.getByTestId('qr-code-image')).toBeInTheDocument();
      });

      expect(mockGeneratePairingCode).toHaveBeenCalled();
    });

    it('should show pairing code expiration countdown', async () => {
      // RED: This test will fail
      const mockGeneratePairingCode = jest.fn().mockResolvedValue({
        code: 'ABC123',
        qrCodeDataURL: 'data:image/png;base64,mockqrcode',
        expiresAt: new Date(Date.now() + 120000) // 2 minutes
      }) as any;

      mockUseMobileDevice.mockReturnValue({
        ...mockDefaultMobileDevice,
        generatePairingCode: mockGeneratePairingCode,
        currentPairingSession: {
          code: 'ABC123',
          expiresAt: new Date(Date.now() + 120000),
          qrCodeDataURL: 'data:image/png;base64,mockqrcode'
        }
      });

      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('pair-new-device-button'));

      await waitFor(() => {
        expect(screen.getByTestId('expiration-countdown')).toBeInTheDocument();
        expect(screen.getByText(/Expires in/)).toBeInTheDocument();
      });
    });

    it('should handle successful device pairing', async () => {
      // RED: This test will fail
      const mockPairDevice = jest.fn().mockResolvedValue({
        success: true,
        device: {
          id: 'device-3',
          name: 'New iPhone',
          model: 'iPhone15,2'
        }
      }) as any;

      mockUseMobileDevice.mockReturnValue({
        ...mockDefaultMobileDevice,
        pairDevice: mockPairDevice
      });

      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      // Simulate pairing success via WebSocket
      const mockSubscribe = mockDefaultWebSocket.subscribe;
      const pairingSuccessHandler = mockSubscribe.mock.calls.find(
        (call: any) => call[0] === 'devicePaired'
      )?.[1];

      if (pairingSuccessHandler) {
        pairingSuccessHandler({
          deviceId: 'device-3',
          deviceName: 'New iPhone',
          success: true
        });
      }

      await waitFor(() => {
        expect(screen.getByTestId('pairing-success-notification')).toBeInTheDocument();
        expect(screen.getByText('Device paired successfully!')).toBeInTheDocument();
      });
    });

    it('should handle pairing failures and show error messages', async () => {
      // RED: This test will fail
      const mockGeneratePairingCode = jest.fn().mockRejectedValue(
        new Error('Rate limit exceeded')
      ) as any;

      mockUseMobileDevice.mockReturnValue({
        ...mockDefaultMobileDevice,
        generatePairingCode: mockGeneratePairingCode
      });

      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('pair-new-device-button'));
      fireEvent.click(screen.getByText('Generate Pairing Code'));

      await waitFor(() => {
        expect(screen.getByTestId('pairing-error')).toBeInTheDocument();
        expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument();
      });
    });
  });

  describe('Device Management Actions', () => {
    it('should allow unpairing a device with confirmation', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      const device1Card = screen.getByTestId('device-card-device-1');
      const unpairButton = within(device1Card).getByTestId('unpair-device-button');
      
      fireEvent.click(unpairButton);

      expect(screen.getByTestId('unpair-confirmation-dialog')).toBeInTheDocument();
      expect(screen.getByText('Unpair Device?')).toBeInTheDocument();
      expect(screen.getByText(/This will remove the device's access/)).toBeInTheDocument();
    });

    it('should execute device unpairing when confirmed', async () => {
      // RED: This test will fail
      const mockUnpairDevice = jest.fn().mockResolvedValue({ success: true }) as any;

      mockUseMobileDevice.mockReturnValue({
        ...mockDefaultMobileDevice,
        unpairDevice: mockUnpairDevice
      });

      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      const device1Card = screen.getByTestId('device-card-device-1');
      fireEvent.click(within(device1Card).getByTestId('unpair-device-button'));

      const confirmButton = screen.getByText('Unpair Device');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockUnpairDevice).toHaveBeenCalledWith('device-1');
      });
    });

    it('should show device details modal when info button clicked', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      const device1Card = screen.getByTestId('device-card-device-1');
      const infoButton = within(device1Card).getByTestId('device-info-button');
      
      fireEvent.click(infoButton);

      expect(screen.getByTestId('device-details-modal')).toBeInTheDocument();
      expect(screen.getByText('Device Details')).toBeInTheDocument();
      expect(screen.getByText('iPhone15,3')).toBeInTheDocument(); // Model
      expect(screen.getByText('iOS 17.2')).toBeInTheDocument(); // OS info
    });

    it('should allow editing device permissions', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      const device1Card = screen.getByTestId('device-card-device-1');
      fireEvent.click(within(device1Card).getByTestId('device-info-button'));

      const editPermissionsButton = screen.getByText('Edit Permissions');
      fireEvent.click(editPermissionsButton);

      expect(screen.getByTestId('permissions-editor')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Stream Control' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'PiP Control' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Notifications' })).toBeChecked();
    });
  });

  describe('Real-time Device Status Updates', () => {
    it('should update device status via WebSocket events', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      // Verify WebSocket subscriptions
      const mockSubscribe = mockDefaultWebSocket.subscribe;
      expect(mockSubscribe).toHaveBeenCalledWith('deviceStatusUpdate', expect.any(Function));

      // Simulate device status update
      const statusUpdateHandler = mockSubscribe.mock.calls.find(
        (call: any) => call[0] === 'deviceStatusUpdate'
      )?.[1];

      if (statusUpdateHandler) {
        statusUpdateHandler({
          deviceId: 'device-1',
          isOnline: false,
          batteryLevel: 75
        });
      }

      await waitFor(() => {
        expect(screen.getByTestId('device-status-offline-device-1')).toBeInTheDocument();
        expect(screen.getByText('75%')).toBeInTheDocument();
      });
    });

    it('should show device activity notifications', async () => {
      // RED: This test will fail  
      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      const mockSubscribe = mockDefaultWebSocket.subscribe;
      const deviceActivityHandler = mockSubscribe.mock.calls.find(
        (call: any) => call[0] === 'deviceActivity'
      )?.[1];

      if (deviceActivityHandler) {
        deviceActivityHandler({
          deviceId: 'device-1',
          deviceName: 'iPhone 15 Pro',
          activity: 'stream_started',
          streamId: 'stream-123'
        });
      }

      await waitFor(() => {
        expect(screen.getByTestId('device-activity-notification')).toBeInTheDocument();
        expect(screen.getByText('iPhone 15 Pro started a stream')).toBeInTheDocument();
      });
    });

    it('should handle device connection/disconnection events', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      const mockSubscribe = mockDefaultWebSocket.subscribe;
      const connectionHandler = mockSubscribe.mock.calls.find(
        (call: any) => call[0] === 'deviceConnectionChanged'
      )?.[1];

      if (connectionHandler) {
        connectionHandler({
          deviceId: 'device-2',
          isOnline: true,
          reconnected: true
        });
      }

      await waitFor(() => {
        expect(screen.getByTestId('device-status-online-device-2')).toBeInTheDocument();
        expect(screen.getByTestId('reconnection-notification')).toBeInTheDocument();
      });
    });
  });

  describe('QR Code Pairing Interface', () => {
    it('should display QR code with proper styling and instructions', async () => {
      // RED: This test will fail
      mockUseMobileDevice.mockReturnValue({
        ...mockDefaultMobileDevice,
        currentPairingSession: {
          code: 'ABC123',
          qrCodeDataURL: 'data:image/png;base64,mockqrcode',
          expiresAt: new Date(Date.now() + 300000)
        }
      });

      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('pair-new-device-button'));

      expect(screen.getByTestId('qr-code-container')).toBeInTheDocument();
      expect(screen.getByAltText('Device Pairing QR Code')).toBeInTheDocument();
      expect(screen.getByText('Scan with your mobile device')).toBeInTheDocument();
      expect(screen.getByText('Or enter code manually: ABC123')).toBeInTheDocument();
    });

    it('should regenerate QR code when requested', async () => {
      // RED: This test will fail
      const mockGeneratePairingCode = jest.fn()
        .mockResolvedValueOnce({
          code: 'ABC123',
          qrCodeDataURL: 'data:image/png;base64,oldcode'
        } as any)
        .mockResolvedValueOnce({
          code: 'XYZ789',
          qrCodeDataURL: 'data:image/png;base64,newcode'
        } as any);

      mockUseMobileDevice.mockReturnValue({
        ...mockDefaultMobileDevice,
        generatePairingCode: mockGeneratePairingCode,
        currentPairingSession: {
          code: 'ABC123',
          qrCodeDataURL: 'data:image/png;base64,oldcode',
          expiresAt: new Date(Date.now() + 300000)
        }
      });

      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('pair-new-device-button'));
      
      const regenerateButton = screen.getByText('Generate New Code');
      fireEvent.click(regenerateButton);

      await waitFor(() => {
        expect(mockGeneratePairingCode).toHaveBeenCalledTimes(2);
      });
    });

    it('should handle QR code scanning errors', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      const mockSubscribe = mockDefaultWebSocket.subscribe;
      const pairingErrorHandler = mockSubscribe.mock.calls.find(
        (call: any) => call[0] === 'pairingError'
      )?.[1];

      if (pairingErrorHandler) {
        pairingErrorHandler({
          code: 'ABC123',
          error: 'Invalid device information',
          deviceAttempt: {
            name: 'Unknown Device',
            os: 'Unknown'
          }
        });
      }

      await waitFor(() => {
        expect(screen.getByTestId('pairing-error-notification')).toBeInTheDocument();
        expect(screen.getByText('Pairing failed: Invalid device information')).toBeInTheDocument();
      });
    });
  });

  describe('Mobile Responsiveness', () => {
    it('should adapt layout for mobile screens', async () => {
      // RED: This test will fail
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      });

      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      expect(screen.getByTestId('mobile-device-manager-mobile')).toBeInTheDocument();
      expect(screen.getByTestId('mobile-device-list')).toBeInTheDocument();
    });

    it('should show simplified device cards on mobile', async () => {
      // RED: This test will fail
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      });

      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      expect(screen.getByTestId('mobile-device-card-device-1')).toBeInTheDocument();
      expect(screen.queryByTestId('desktop-device-card-device-1')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility Features', () => {
    it('should have proper ARIA labels and roles', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      expect(screen.getByRole('main')).toHaveAttribute('aria-label', 'Mobile Device Manager');
      expect(screen.getByRole('list')).toHaveAttribute('aria-label', 'Paired mobile devices');
    });

    it('should support keyboard navigation for device actions', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      const firstDeviceCard = screen.getByTestId('device-card-device-1');
      const unpairButton = within(firstDeviceCard).getByTestId('unpair-device-button');
      
      unpairButton.focus();
      fireEvent.keyDown(unpairButton, { key: 'Enter' });

      expect(screen.getByTestId('unpair-confirmation-dialog')).toBeInTheDocument();
    });

    it('should announce device status changes to screen readers', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('Error Handling', () => {
    it('should display error messages when device operations fail', async () => {
      // RED: This test will fail
      mockUseMobileDevice.mockReturnValue({
        ...mockDefaultMobileDevice,
        error: 'Failed to load devices'
      });

      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      expect(screen.getByTestId('devices-error')).toBeInTheDocument();
      expect(screen.getByText('Failed to load devices')).toBeInTheDocument();
    });

    it('should handle network disconnection gracefully', async () => {
      // RED: This test will fail
      mockUseWebSocket.mockReturnValue({
        ...mockDefaultWebSocket,
        isConnected: false
      });

      render(
        <TestWrapper>
          <MobileDeviceManager />
        </TestWrapper>
      );

      expect(screen.getByTestId('offline-mode-indicator')).toBeInTheDocument();
      expect(screen.getByText('Offline - Device status may be outdated')).toBeInTheDocument();
    });
  });
});
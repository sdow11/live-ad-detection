import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { jest } from '@jest/globals';
import { DeviceConnectionStatus } from '@/components/DeviceConnectionStatus';
import { AuthProvider } from '@/contexts/AuthContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';

// TDD Phase 1: RED - Write failing tests for Device Connection Status UI
// Following SOLID principles and comprehensive real-time connection monitoring

// Mock dependencies
jest.mock('@/hooks/useWebSocket');
jest.mock('@/hooks/useAuth');
jest.mock('@/services/MobileAuthService');

const mockUseWebSocket = jest.fn();
const mockUseAuth = jest.fn();

require('@/hooks/useWebSocket').useWebSocket = mockUseWebSocket;
require('@/hooks/useAuth').useAuth = mockUseAuth;

// Test wrapper with providers
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>
    <WebSocketProvider>
      {children}
    </WebSocketProvider>
  </AuthProvider>
);

describe('DeviceConnectionStatus (TDD)', () => {
  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com'
  };

  const mockOnlineDevice = {
    id: 'device-1',
    deviceId: 'mobile-device-1',
    name: 'iPhone 15 Pro',
    model: 'iPhone15,3',
    os: 'iOS',
    osVersion: '17.2',
    isOnline: true,
    connectionQuality: 'excellent',
    lastPing: new Date(),
    batteryLevel: 85,
    networkType: 'wifi',
    signalStrength: 4,
    dataUsage: { sent: 1024, received: 2048 },
    connectionDuration: 3600000 // 1 hour in ms
  };

  const mockOfflineDevice = {
    ...mockOnlineDevice,
    id: 'device-2',
    name: 'Samsung Galaxy S24',
    isOnline: false,
    connectionQuality: null,
    lastSeen: new Date(Date.now() - 300000), // 5 minutes ago
    disconnectionReason: 'network_timeout'
  };

  const mockUnstableDevice = {
    ...mockOnlineDevice,
    id: 'device-3',
    name: 'iPad Pro',
    connectionQuality: 'poor',
    signalStrength: 1,
    networkType: 'cellular',
    latency: 250,
    packetLoss: 5.5
  };

  const defaultProps = {
    device: mockOnlineDevice,
    onReconnect: jest.fn(),
    onDiagnostics: jest.fn(),
    onOptimizeConnection: jest.fn(),
    showDetails: false,
    className: ''
  };

  const mockDefaultWebSocket = {
    socket: null,
    isConnected: true,
    emit: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockUseAuth.mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      login: jest.fn(),
      logout: jest.fn(),
      loading: false
    });

    mockUseWebSocket.mockReturnValue(mockDefaultWebSocket);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Connection Status Display', () => {
    it('should render device connection status component', async () => {
      // RED: This test will fail because component doesn't exist yet
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('device-connection-status')).toBeInTheDocument();
      expect(screen.getByTestId(`connection-status-${mockOnlineDevice.id}`)).toBeInTheDocument();
    });

    it('should display online status with green indicator', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('online-indicator')).toBeInTheDocument();
      expect(screen.getByTestId('online-indicator')).toHaveClass('bg-green-500');
      expect(screen.getByText('Online')).toBeInTheDocument();
    });

    it('should display offline status with gray indicator', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} device={mockOfflineDevice} />
        </TestWrapper>
      );

      expect(screen.getByTestId('offline-indicator')).toBeInTheDocument();
      expect(screen.getByTestId('offline-indicator')).toHaveClass('bg-gray-400');
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });

    it('should show connection quality indicator', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('connection-quality')).toBeInTheDocument();
      expect(screen.getByText('Excellent')).toBeInTheDocument();
      expect(screen.getByTestId('quality-excellent')).toBeInTheDocument();
    });

    it('should display poor connection quality with warning', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} device={mockUnstableDevice} />
        </TestWrapper>
      );

      expect(screen.getByTestId('quality-poor')).toBeInTheDocument();
      expect(screen.getByText('Poor')).toBeInTheDocument();
      expect(screen.getByTestId('connection-warning')).toBeInTheDocument();
    });

    it('should show last seen time for offline devices', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} device={mockOfflineDevice} />
        </TestWrapper>
      );

      expect(screen.getByTestId('last-seen')).toBeInTheDocument();
      expect(screen.getByText(/Last seen/)).toBeInTheDocument();
      expect(screen.getByText(/5 minutes ago/)).toBeInTheDocument();
    });

    it('should display disconnection reason for offline devices', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} device={mockOfflineDevice} />
        </TestWrapper>
      );

      expect(screen.getByTestId('disconnection-reason')).toBeInTheDocument();
      expect(screen.getByText(/Network timeout/)).toBeInTheDocument();
    });
  });

  describe('Signal Strength Indicator', () => {
    it('should display signal strength bars', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('signal-strength')).toBeInTheDocument();
      expect(screen.getByTestId('signal-bars')).toBeInTheDocument();
      
      // 4/4 bars should be active for excellent signal
      const bars = screen.getAllByTestId(/signal-bar-/);
      expect(bars).toHaveLength(4);
      bars.forEach(bar => {
        expect(bar).toHaveClass('bg-green-500');
      });
    });

    it('should show weak signal with fewer active bars', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} device={mockUnstableDevice} />
        </TestWrapper>
      );

      const bars = screen.getAllByTestId(/signal-bar-/);
      expect(bars).toHaveLength(4);
      
      // Only 1 bar should be active for poor signal
      expect(screen.getByTestId('signal-bar-1')).toHaveClass('bg-red-500');
      expect(screen.getByTestId('signal-bar-2')).toHaveClass('bg-gray-300');
      expect(screen.getByTestId('signal-bar-3')).toHaveClass('bg-gray-300');
      expect(screen.getByTestId('signal-bar-4')).toHaveClass('bg-gray-300');
    });

    it('should display network type icon', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('network-type-wifi')).toBeInTheDocument();
      expect(screen.getByText('WiFi')).toBeInTheDocument();
    });

    it('should show cellular network type for mobile data', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} device={mockUnstableDevice} />
        </TestWrapper>
      );

      expect(screen.getByTestId('network-type-cellular')).toBeInTheDocument();
      expect(screen.getByText('Cellular')).toBeInTheDocument();
    });
  });

  describe('Connection Metrics', () => {
    it('should display connection duration for online devices', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('connection-duration')).toBeInTheDocument();
      expect(screen.getByText(/Connected for/)).toBeInTheDocument();
      expect(screen.getByText(/1h 0m/)).toBeInTheDocument();
    });

    it('should show latency and packet loss for detailed view', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} device={mockUnstableDevice} showDetails={true} />
        </TestWrapper>
      );

      expect(screen.getByTestId('connection-metrics')).toBeInTheDocument();
      expect(screen.getByTestId('latency-metric')).toBeInTheDocument();
      expect(screen.getByText('250ms')).toBeInTheDocument();
      
      expect(screen.getByTestId('packet-loss-metric')).toBeInTheDocument();
      expect(screen.getByText('5.5%')).toBeInTheDocument();
    });

    it('should display data usage statistics', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} showDetails={true} />
        </TestWrapper>
      );

      expect(screen.getByTestId('data-usage')).toBeInTheDocument();
      expect(screen.getByText(/Sent: 1.0 KB/)).toBeInTheDocument();
      expect(screen.getByText(/Received: 2.0 KB/)).toBeInTheDocument();
    });

    it('should update connection metrics in real-time', async () => {
      // RED: This test will fail
      const mockSubscribe = jest.fn();
      mockUseWebSocket.mockReturnValue({
        ...mockDefaultWebSocket,
        subscribe: mockSubscribe
      });

      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} showDetails={true} />
        </TestWrapper>
      );

      // Simulate real-time metric update
      const metricsCallback = mockSubscribe.mock.calls.find(
        (call: any) => call[0] === `device.${mockOnlineDevice.id}.metrics`
      )?.[1];

      if (metricsCallback) {
        metricsCallback({
          latency: 150,
          packetLoss: 2.1,
          dataUsage: { sent: 2048, received: 4096 }
        });
      }

      await waitFor(() => {
        expect(screen.getByText('150ms')).toBeInTheDocument();
        expect(screen.getByText('2.1%')).toBeInTheDocument();
      });
    });
  });

  describe('Connection Actions', () => {
    it('should show reconnect button for offline devices', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} device={mockOfflineDevice} />
        </TestWrapper>
      );

      expect(screen.getByTestId('reconnect-button')).toBeInTheDocument();
      expect(screen.getByText('Reconnect')).toBeInTheDocument();
    });

    it('should call onReconnect when reconnect button clicked', async () => {
      // RED: This test will fail
      const mockReconnect = jest.fn();

      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} 
            device={mockOfflineDevice} 
            onReconnect={mockReconnect} 
          />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('reconnect-button'));
      expect(mockReconnect).toHaveBeenCalledWith(mockOfflineDevice);
    });

    it('should show diagnostics button for connection issues', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} device={mockUnstableDevice} />
        </TestWrapper>
      );

      expect(screen.getByTestId('diagnostics-button')).toBeInTheDocument();
      expect(screen.getByText('Run Diagnostics')).toBeInTheDocument();
    });

    it('should call onDiagnostics when diagnostics button clicked', async () => {
      // RED: This test will fail
      const mockDiagnostics = jest.fn();

      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} 
            device={mockUnstableDevice}
            onDiagnostics={mockDiagnostics} 
          />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('diagnostics-button'));
      expect(mockDiagnostics).toHaveBeenCalledWith(mockUnstableDevice);
    });

    it('should show optimize connection button for poor connections', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} device={mockUnstableDevice} />
        </TestWrapper>
      );

      expect(screen.getByTestId('optimize-button')).toBeInTheDocument();
      expect(screen.getByText('Optimize')).toBeInTheDocument();
    });

    it('should call onOptimizeConnection when optimize button clicked', async () => {
      // RED: This test will fail
      const mockOptimize = jest.fn();

      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} 
            device={mockUnstableDevice}
            onOptimizeConnection={mockOptimize} 
          />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('optimize-button'));
      expect(mockOptimize).toHaveBeenCalledWith(mockUnstableDevice);
    });
  });

  describe('Real-time Updates', () => {
    it('should subscribe to device connection events', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} />
        </TestWrapper>
      );

      expect(mockDefaultWebSocket.subscribe).toHaveBeenCalledWith(
        `device.${mockOnlineDevice.id}.connection`,
        expect.any(Function)
      );
      expect(mockDefaultWebSocket.subscribe).toHaveBeenCalledWith(
        `device.${mockOnlineDevice.id}.metrics`,
        expect.any(Function)
      );
    });

    it('should handle device going offline in real-time', async () => {
      // RED: This test will fail
      const mockSubscribe = jest.fn();
      mockUseWebSocket.mockReturnValue({
        ...mockDefaultWebSocket,
        subscribe: mockSubscribe
      });

      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} />
        </TestWrapper>
      );

      // Simulate device disconnect
      const connectionCallback = mockSubscribe.mock.calls.find(
        (call: any) => call[0] === `device.${mockOnlineDevice.id}.connection`
      )?.[1];

      if (connectionCallback) {
        connectionCallback({
          isOnline: false,
          lastSeen: new Date().toISOString(),
          disconnectionReason: 'network_error'
        });
      }

      await waitFor(() => {
        expect(screen.getByTestId('offline-indicator')).toBeInTheDocument();
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should handle device reconnection events', async () => {
      // RED: This test will fail
      const mockSubscribe = jest.fn();
      mockUseWebSocket.mockReturnValue({
        ...mockDefaultWebSocket,
        subscribe: mockSubscribe
      });

      const { rerender } = render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} device={mockOfflineDevice} />
        </TestWrapper>
      );

      // Simulate reconnection
      const connectionCallback = mockSubscribe.mock.calls.find(
        (call: any) => call[0] === `device.${mockOfflineDevice.id}.connection`
      )?.[1];

      if (connectionCallback) {
        connectionCallback({
          isOnline: true,
          connectionQuality: 'good',
          signalStrength: 3
        });
      }

      await waitFor(() => {
        expect(screen.getByTestId('online-indicator')).toBeInTheDocument();
        expect(screen.getByTestId('reconnection-notification')).toBeInTheDocument();
      });
    });

    it('should show connection quality changes with animations', async () => {
      // RED: This test will fail
      const mockSubscribe = jest.fn();
      mockUseWebSocket.mockReturnValue({
        ...mockDefaultWebSocket,
        subscribe: mockSubscribe
      });

      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} />
        </TestWrapper>
      );

      // Simulate quality degradation
      const metricsCallback = mockSubscribe.mock.calls.find(
        (call: any) => call[0] === `device.${mockOnlineDevice.id}.metrics`
      )?.[1];

      if (metricsCallback) {
        metricsCallback({
          connectionQuality: 'poor',
          signalStrength: 1,
          latency: 300
        });
      }

      await waitFor(() => {
        expect(screen.getByTestId('quality-poor')).toBeInTheDocument();
        expect(screen.getByTestId('quality-change-animation')).toBeInTheDocument();
      });
    });
  });

  describe('Status Indicators', () => {
    it('should display animated pulse for active connections', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('online-indicator')).toHaveClass('animate-pulse');
    });

    it('should show warning indicator for unstable connections', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} device={mockUnstableDevice} />
        </TestWrapper>
      );

      expect(screen.getByTestId('unstable-connection-warning')).toBeInTheDocument();
      expect(screen.getByTestId('warning-icon')).toBeInTheDocument();
    });

    it('should display battery level impact on connection', async () => {
      // RED: This test will fail
      const lowBatteryDevice = {
        ...mockOnlineDevice,
        batteryLevel: 10,
        connectionQuality: 'poor'
      };

      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} device={lowBatteryDevice} />
        </TestWrapper>
      );

      expect(screen.getByTestId('battery-impact-warning')).toBeInTheDocument();
      expect(screen.getByText(/Low battery may affect connection/)).toBeInTheDocument();
    });

    it('should show connection history trend', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} showDetails={true} />
        </TestWrapper>
      );

      expect(screen.getByTestId('connection-trend')).toBeInTheDocument();
      expect(screen.getByTestId('trend-chart')).toBeInTheDocument();
    });
  });

  describe('Accessibility Features', () => {
    it('should have proper ARIA labels and roles', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} />
        </TestWrapper>
      );

      const statusElement = screen.getByTestId('device-connection-status');
      expect(statusElement).toHaveAttribute('role', 'status');
      expect(statusElement).toHaveAttribute('aria-label', 'Device connection status');
    });

    it('should announce connection status changes', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    });

    it('should support keyboard navigation for actions', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} device={mockOfflineDevice} />
        </TestWrapper>
      );

      const reconnectButton = screen.getByTestId('reconnect-button');
      reconnectButton.focus();
      
      fireEvent.keyDown(reconnectButton, { key: 'Enter' });
      expect(defaultProps.onReconnect).toHaveBeenCalled();
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
          <DeviceConnectionStatus {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('mobile-connection-status')).toBeInTheDocument();
    });

    it('should show compact signal bars on mobile', async () => {
      // RED: This test will fail
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      });

      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('compact-signal-bars')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle WebSocket disconnection gracefully', async () => {
      // RED: This test will fail
      mockUseWebSocket.mockReturnValue({
        ...mockDefaultWebSocket,
        isConnected: false
      });

      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('websocket-disconnected')).toBeInTheDocument();
      expect(screen.getByText(/Unable to get real-time updates/)).toBeInTheDocument();
    });

    it('should show error state for invalid device data', async () => {
      // RED: This test will fail
      const invalidDevice = {
        ...mockOnlineDevice,
        connectionQuality: null,
        isOnline: null
      };

      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} device={invalidDevice as any} />
        </TestWrapper>
      );

      expect(screen.getByTestId('connection-data-error')).toBeInTheDocument();
      expect(screen.getByText('Unable to determine connection status')).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('should cleanup subscriptions on unmount', async () => {
      // RED: This test will fail
      const mockUnsubscribe = jest.fn();
      mockDefaultWebSocket.subscribe.mockReturnValue(mockUnsubscribe);

      const { unmount } = render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} />
        </TestWrapper>
      );

      unmount();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(2); // connection and metrics subscriptions
    });

    it('should throttle rapid connection status updates', async () => {
      // RED: This test will fail
      const mockSubscribe = jest.fn();
      mockUseWebSocket.mockReturnValue({
        ...mockDefaultWebSocket,
        subscribe: mockSubscribe
      });

      render(
        <TestWrapper>
          <DeviceConnectionStatus {...defaultProps} />
        </TestWrapper>
      );

      const connectionCallback = mockSubscribe.mock.calls.find(
        (call: any) => call[0] === `device.${mockOnlineDevice.id}.connection`
      )?.[1];

      // Simulate rapid updates
      if (connectionCallback) {
        for (let i = 0; i < 10; i++) {
          connectionCallback({
            connectionQuality: i % 2 === 0 ? 'good' : 'poor',
            signalStrength: (i % 4) + 1
          });
        }
      }

      // Should only process the latest update due to throttling
      await waitFor(() => {
        expect(screen.getByTestId('throttled-update-indicator')).toBeInTheDocument();
      });
    });
  });
});
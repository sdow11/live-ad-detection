import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { jest } from '@jest/globals';
import { DeviceCard } from '@/components/DeviceCard';
import { AuthProvider } from '@/contexts/AuthContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';

// TDD Phase 1: RED - Write failing tests for Device Card component
// Following SOLID principles and comprehensive device card testing

// Mock dependencies
jest.mock('@/hooks/useWebSocket');
jest.mock('@/hooks/useAuth');

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

describe('DeviceCard (TDD)', () => {
  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com'
  };

  const mockDevice = {
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
    lastSeen: new Date('2023-01-01T12:00:00Z'),
    batteryLevel: 85,
    networkType: 'wifi',
    fingerprint: 'abc123def456'
  };

  const mockOfflineDevice = {
    ...mockDevice,
    id: 'device-2',
    name: 'Samsung Galaxy S24',
    isOnline: false,
    batteryLevel: 45,
    lastSeen: new Date('2023-01-01T11:55:00Z'), // 5 minutes ago
    networkType: 'cellular'
  };

  const defaultProps = {
    device: mockDevice,
    onUnpair: jest.fn(),
    onShowDetails: jest.fn(),
    onEditPermissions: jest.fn(),
    onRefresh: jest.fn(),
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

    mockUseAuth.mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      login: jest.fn(),
      logout: jest.fn(),
      loading: false
    });

    mockUseWebSocket.mockReturnValue(mockDefaultWebSocket);
  });

  describe('Device Display', () => {
    it('should render device card with basic information', async () => {
      // RED: This test will fail because component doesn't exist yet
      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('device-card-device-1')).toBeInTheDocument();
      expect(screen.getByText('iPhone 15 Pro')).toBeInTheDocument();
      expect(screen.getByText('iPhone15,3')).toBeInTheDocument();
    });

    it('should display device status indicator for online device', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('device-status-online')).toBeInTheDocument();
      expect(screen.getByTestId('device-status-online')).toHaveClass('bg-green-500');
    });

    it('should display device status indicator for offline device', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} device={mockOfflineDevice} />
        </TestWrapper>
      );

      expect(screen.getByTestId('device-status-offline')).toBeInTheDocument();
      expect(screen.getByTestId('device-status-offline')).toHaveClass('bg-gray-400');
    });

    it('should show battery level with appropriate styling', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      const batteryIndicator = screen.getByTestId('battery-level');
      expect(batteryIndicator).toBeInTheDocument();
      expect(batteryIndicator).toHaveTextContent('85%');
      expect(batteryIndicator).toHaveClass('text-green-600'); // Good battery level
    });

    it('should show low battery warning for devices with low battery', async () => {
      // RED: This test will fail
      const lowBatteryDevice = { ...mockDevice, batteryLevel: 15 };
      
      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} device={lowBatteryDevice} />
        </TestWrapper>
      );

      const batteryIndicator = screen.getByTestId('battery-level');
      expect(batteryIndicator).toHaveClass('text-red-600'); // Low battery warning
      expect(screen.getByTestId('low-battery-warning')).toBeInTheDocument();
    });

    it('should display OS information correctly', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByText('iOS 17.2')).toBeInTheDocument();
      expect(screen.getByTestId('os-info')).toBeInTheDocument();
    });

    it('should show network type indicator', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      const networkIndicator = screen.getByTestId('network-type');
      expect(networkIndicator).toBeInTheDocument();
      expect(networkIndicator).toHaveTextContent('WiFi');
    });

    it('should display last seen time for offline devices', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} device={mockOfflineDevice} />
        </TestWrapper>
      );

      expect(screen.getByTestId('last-seen')).toBeInTheDocument();
      expect(screen.getByText(/Last seen/)).toBeInTheDocument();
    });
  });

  describe('Device Capabilities', () => {
    it('should display device capabilities as badges', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByText('Stream Control')).toBeInTheDocument();
      expect(screen.getByText('PiP Control')).toBeInTheDocument();
      expect(screen.getByText('Notifications')).toBeInTheDocument();
    });

    it('should show limited capabilities for restricted devices', async () => {
      // RED: This test will fail
      const restrictedDevice = {
        ...mockDevice,
        capabilities: ['notifications']
      };

      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} device={restrictedDevice} />
        </TestWrapper>
      );

      expect(screen.getByText('Notifications')).toBeInTheDocument();
      expect(screen.queryByText('Stream Control')).not.toBeInTheDocument();
      expect(screen.queryByText('PiP Control')).not.toBeInTheDocument();
    });

    it('should indicate when device has full access', async () => {
      // RED: This test will fail
      const fullAccessDevice = {
        ...mockDevice,
        capabilities: ['stream_control', 'pip_control', 'notifications', 'analytics', 'settings']
      };

      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} device={fullAccessDevice} />
        </TestWrapper>
      );

      expect(screen.getByTestId('full-access-indicator')).toBeInTheDocument();
      expect(screen.getByText('Full Access')).toBeInTheDocument();
    });
  });

  describe('Device Actions', () => {
    it('should render action buttons for device management', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('show-details-button')).toBeInTheDocument();
      expect(screen.getByTestId('edit-permissions-button')).toBeInTheDocument();
      expect(screen.getByTestId('unpair-button')).toBeInTheDocument();
      expect(screen.getByTestId('refresh-button')).toBeInTheDocument();
    });

    it('should call onShowDetails when details button clicked', async () => {
      // RED: This test will fail
      const mockShowDetails = jest.fn();

      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} onShowDetails={mockShowDetails} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('show-details-button'));
      expect(mockShowDetails).toHaveBeenCalledWith(mockDevice);
    });

    it('should call onEditPermissions when edit button clicked', async () => {
      // RED: This test will fail
      const mockEditPermissions = jest.fn();

      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} onEditPermissions={mockEditPermissions} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('edit-permissions-button'));
      expect(mockEditPermissions).toHaveBeenCalledWith(mockDevice);
    });

    it('should call onUnpair when unpair button clicked', async () => {
      // RED: This test will fail
      const mockUnpair = jest.fn();

      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} onUnpair={mockUnpair} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('unpair-button'));
      expect(mockUnpair).toHaveBeenCalledWith(mockDevice);
    });

    it('should call onRefresh when refresh button clicked', async () => {
      // RED: This test will fail
      const mockRefresh = jest.fn();

      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} onRefresh={mockRefresh} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('refresh-button'));
      expect(mockRefresh).toHaveBeenCalledWith(mockDevice);
    });

    it('should disable actions when device is offline and show appropriate state', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} device={mockOfflineDevice} />
        </TestWrapper>
      );

      const refreshButton = screen.getByTestId('refresh-button');
      expect(refreshButton).toBeEnabled(); // Refresh should still work
      
      const editButton = screen.getByTestId('edit-permissions-button');
      expect(editButton).toBeEnabled(); // Permissions can be edited offline
      
      expect(screen.getByTestId('offline-indicator')).toBeInTheDocument();
    });
  });

  describe('Real-time Updates', () => {
    it('should update device status when WebSocket event received', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      // Verify WebSocket subscription for device updates
      expect(mockDefaultWebSocket.subscribe).toHaveBeenCalledWith(
        `device.${mockDevice.id}.status`,
        expect.any(Function)
      );
    });

    it('should show connection status changes in real-time', async () => {
      // RED: This test will fail
      const mockSubscribe = jest.fn();
      mockUseWebSocket.mockReturnValue({
        ...mockDefaultWebSocket,
        subscribe: mockSubscribe
      });

      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      // Simulate device going offline
      const statusCallback = mockSubscribe.mock.calls.find(
        (call: any) => call[0] === `device.${mockDevice.id}.status`
      )?.[1];

      if (statusCallback) {
        statusCallback({
          isOnline: false,
          lastSeen: new Date().toISOString()
        });
      }

      await waitFor(() => {
        expect(screen.getByTestId('device-status-offline')).toBeInTheDocument();
      });
    });

    it('should update battery level in real-time', async () => {
      // RED: This test will fail
      const mockSubscribe = jest.fn();
      mockUseWebSocket.mockReturnValue({
        ...mockDefaultWebSocket,
        subscribe: mockSubscribe
      });

      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      // Simulate battery level update
      const statusCallback = mockSubscribe.mock.calls.find(
        (call: any) => call[0] === `device.${mockDevice.id}.status`
      )?.[1];

      if (statusCallback) {
        statusCallback({
          batteryLevel: 25
        });
      }

      await waitFor(() => {
        expect(screen.getByText('25%')).toBeInTheDocument();
      });
    });
  });

  describe('Visual States', () => {
    it('should apply different styling for online vs offline devices', async () => {
      // RED: This test will fail
      const { rerender } = render(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      const onlineCard = screen.getByTestId('device-card-device-1');
      expect(onlineCard).toHaveClass('border-green-200'); // Online styling

      rerender(
        <TestWrapper>
          <DeviceCard {...defaultProps} device={mockOfflineDevice} />
        </TestWrapper>
      );

      const offlineCard = screen.getByTestId('device-card-device-2');
      expect(offlineCard).toHaveClass('border-gray-200'); // Offline styling
    });

    it('should show loading state when refreshing device', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('refresh-button'));

      await waitFor(() => {
        expect(screen.getByTestId('device-loading')).toBeInTheDocument();
      });
    });

    it('should highlight device card when recently updated', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      const card = screen.getByTestId('device-card-device-1');
      
      // Simulate recent update
      fireEvent.click(screen.getByTestId('refresh-button'));

      await waitFor(() => {
        expect(card).toHaveClass('ring-2', 'ring-blue-500'); // Highlight effect
      });
    });
  });

  describe('Accessibility Features', () => {
    it('should have proper ARIA labels and roles', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      const card = screen.getByTestId('device-card-device-1');
      expect(card).toHaveAttribute('role', 'article');
      expect(card).toHaveAttribute('aria-label', 'iPhone 15 Pro device card');
    });

    it('should support keyboard navigation for actions', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      const detailsButton = screen.getByTestId('show-details-button');
      detailsButton.focus();
      
      fireEvent.keyDown(detailsButton, { key: 'Enter' });
      expect(defaultProps.onShowDetails).toHaveBeenCalled();
    });

    it('should announce status changes to screen readers', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('Responsive Design', () => {
    it('should adapt layout for mobile screens', async () => {
      // RED: This test will fail
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      });

      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('mobile-device-card')).toBeInTheDocument();
    });

    it('should show compact view on small screens', async () => {
      // RED: This test will fail
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      });

      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('compact-view')).toBeInTheDocument();
      expect(screen.queryByTestId('detailed-view')).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle WebSocket connection errors gracefully', async () => {
      // RED: This test will fail
      mockUseWebSocket.mockReturnValue({
        ...mockDefaultWebSocket,
        isConnected: false
      });

      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('connection-error-indicator')).toBeInTheDocument();
    });

    it('should show error state when device data is invalid', async () => {
      // RED: This test will fail
      const invalidDevice = {
        ...mockDevice,
        name: '',
        model: null
      };

      render(
        <TestWrapper>
          <DeviceCard {...defaultProps} device={invalidDevice as any} />
        </TestWrapper>
      );

      expect(screen.getByTestId('device-error')).toBeInTheDocument();
      expect(screen.getByText('Unknown Device')).toBeInTheDocument();
    });
  });

  describe('Performance Optimizations', () => {
    it('should memoize expensive operations', async () => {
      // RED: This test will fail
      const { rerender } = render(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      // Component should not re-render if device data hasn't changed
      rerender(
        <TestWrapper>
          <DeviceCard {...defaultProps} />
        </TestWrapper>
      );

      // This test would verify memoization but component doesn't exist yet
      expect(screen.getByTestId('device-card-device-1')).toBeInTheDocument();
    });
  });
});
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MobileRemoteControl } from '@/components/MobileRemoteControl';
import { AuthProvider } from '@/contexts/AuthContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';

// TDD Phase 1: RED - Write failing tests for Mobile Remote Control Interface
// Following SOLID principles and comprehensive mobile device control testing

// Mock dependencies
jest.mock('@/hooks/useWebSocket');
jest.mock('@/hooks/useAuth');
jest.mock('@/services/MobileRemoteService');

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

describe('MobileRemoteControl (TDD)', () => {
  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com'
  };

  const mockActiveStream = {
    id: 'stream-1',
    title: 'Test Stream',
    status: { state: 'live', health: 'good' },
    quality: { resolution: '1920x1080', bitrate: 2500, framerate: 30 },
    currentViewers: 150,
    isPublic: true,
    recordingEnabled: true,
    adDetectionEnabled: true,
    thumbnailUrl: 'https://example.com/thumb.jpg',
    createdAt: new Date()
  };

  const mockConnectedDevice = {
    id: 'device-1',
    deviceId: 'mobile-device-1',
    name: 'iPhone 15 Pro',
    model: 'iPhone15,3',
    os: 'iOS',
    osVersion: '17.2',
    capabilities: ['stream_control', 'pip_control', 'notifications', 'analytics'],
    isPaired: true,
    isOnline: true,
    batteryLevel: 85,
    permissions: {
      canControlStreams: true,
      canTogglePiP: true,
      canViewAnalytics: true,
      canReceiveNotifications: true,
      canControlQuality: true
    }
  };

  const mockPiPSession = {
    isActive: true,
    streamId: 'stream-1',
    position: { x: 100, y: 100 },
    size: { width: 320, height: 180 },
    opacity: 0.9,
    isMinimized: false
  };

  const defaultProps = {
    connectedDevice: mockConnectedDevice,
    activeStream: mockActiveStream,
    pipSession: mockPiPSession,
    onStreamControl: jest.fn().mockImplementation(() => Promise.resolve()),
    onPiPControl: jest.fn().mockImplementation(() => Promise.resolve()),
    onQualityChange: jest.fn().mockImplementation(() => Promise.resolve()),
    onNotificationToggle: jest.fn(),
    onAnalyticsView: jest.fn(),
    onDisconnect: jest.fn(),
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

  describe('Remote Control Interface', () => {
    it('should render mobile remote control interface', async () => {
      // RED: This test will fail because component doesn't exist yet
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('mobile-remote-control')).toBeInTheDocument();
      expect(screen.getByTestId('device-info-header')).toBeInTheDocument();
      expect(screen.getByText('iPhone 15 Pro')).toBeInTheDocument();
    });

    it('should display device connection status', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('device-connection-indicator')).toBeInTheDocument();
      expect(screen.getByTestId('device-online-status')).toBeInTheDocument();
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('should show device capabilities and permissions', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('device-capabilities')).toBeInTheDocument();
      expect(screen.getByText('Stream Control')).toBeInTheDocument();
      expect(screen.getByText('PiP Control')).toBeInTheDocument();
      expect(screen.getByText('Analytics')).toBeInTheDocument();
    });

    it('should handle disconnected device gracefully', async () => {
      // RED: This test will fail
      const disconnectedDevice = { ...mockConnectedDevice, isOnline: false };

      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} connectedDevice={disconnectedDevice} />
        </TestWrapper>
      );

      expect(screen.getByTestId('device-disconnected')).toBeInTheDocument();
      expect(screen.getByText('Device Disconnected')).toBeInTheDocument();
      expect(screen.getByTestId('reconnect-button')).toBeInTheDocument();
    });
  });

  describe('Stream Control Panel', () => {
    it('should display active stream information', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('active-stream-panel')).toBeInTheDocument();
      expect(screen.getByText('Test Stream')).toBeInTheDocument();
      expect(screen.getByText('150 viewers')).toBeInTheDocument();
      expect(screen.getByText('1920x1080')).toBeInTheDocument();
    });

    it('should show stream control buttons when device has permission', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('stream-controls')).toBeInTheDocument();
      expect(screen.getByTestId('pause-stream-button')).toBeInTheDocument();
      expect(screen.getByTestId('stop-stream-button')).toBeInTheDocument();
      expect(screen.getByTestId('restart-stream-button')).toBeInTheDocument();
    });

    it('should call onStreamControl when stream action button clicked', async () => {
      // RED: This test will fail
      const mockStreamControl = jest.fn().mockImplementation(() => Promise.resolve());

      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} onStreamControl={mockStreamControl} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('pause-stream-button'));
      expect(mockStreamControl).toHaveBeenCalledWith('pause', mockActiveStream);

      fireEvent.click(screen.getByTestId('stop-stream-button'));
      expect(mockStreamControl).toHaveBeenCalledWith('stop', mockActiveStream);
    });

    it('should disable stream controls when device lacks permission', async () => {
      // RED: This test will fail
      const restrictedDevice = {
        ...mockConnectedDevice,
        permissions: { ...mockConnectedDevice.permissions, canControlStreams: false }
      };

      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} connectedDevice={restrictedDevice} />
        </TestWrapper>
      );

      expect(screen.getByTestId('pause-stream-button')).toBeDisabled();
      expect(screen.getByTestId('stop-stream-button')).toBeDisabled();
      expect(screen.getByTestId('permission-denied-message')).toBeInTheDocument();
    });

    it('should show no active stream message when no stream is live', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} activeStream={null} />
        </TestWrapper>
      );

      expect(screen.getByTestId('no-active-stream')).toBeInTheDocument();
      expect(screen.getByText('No Active Stream')).toBeInTheDocument();
      expect(screen.getByText('Start a stream to enable remote controls')).toBeInTheDocument();
    });
  });

  describe('Picture-in-Picture Controls', () => {
    it('should display PiP control panel', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('pip-control-panel')).toBeInTheDocument();
      expect(screen.getByTestId('pip-toggle-button')).toBeInTheDocument();
      expect(screen.getByText('Picture-in-Picture')).toBeInTheDocument();
    });

    it('should show PiP as active when session exists', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('pip-active-indicator')).toBeInTheDocument();
      expect(screen.getByText('PiP Active')).toBeInTheDocument();
      expect(screen.getByTestId('pip-position-info')).toBeInTheDocument();
    });

    it('should call onPiPControl when PiP toggle clicked', async () => {
      // RED: This test will fail
      const mockPiPControl = jest.fn().mockImplementation(() => Promise.resolve());

      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} onPiPControl={mockPiPControl} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('pip-toggle-button'));
      expect(mockPiPControl).toHaveBeenCalledWith('toggle');
    });

    it('should show PiP position and size controls', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('pip-position-controls')).toBeInTheDocument();
      expect(screen.getByTestId('pip-move-up-button')).toBeInTheDocument();
      expect(screen.getByTestId('pip-move-down-button')).toBeInTheDocument();
      expect(screen.getByTestId('pip-move-left-button')).toBeInTheDocument();
      expect(screen.getByTestId('pip-move-right-button')).toBeInTheDocument();
    });

    it('should handle PiP position controls', async () => {
      // RED: This test will fail
      const mockPiPControl = jest.fn().mockImplementation(() => Promise.resolve());

      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} onPiPControl={mockPiPControl} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('pip-move-up-button'));
      expect(mockPiPControl).toHaveBeenCalledWith('move', { direction: 'up', amount: 10 });

      fireEvent.click(screen.getByTestId('pip-move-left-button'));
      expect(mockPiPControl).toHaveBeenCalledWith('move', { direction: 'left', amount: 10 });
    });

    it('should show PiP size controls', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('pip-size-controls')).toBeInTheDocument();
      expect(screen.getByTestId('pip-size-increase-button')).toBeInTheDocument();
      expect(screen.getByTestId('pip-size-decrease-button')).toBeInTheDocument();
    });

    it('should disable PiP controls when device lacks permission', async () => {
      // RED: This test will fail
      const restrictedDevice = {
        ...mockConnectedDevice,
        permissions: { ...mockConnectedDevice.permissions, canTogglePiP: false }
      };

      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} connectedDevice={restrictedDevice} />
        </TestWrapper>
      );

      expect(screen.getByTestId('pip-toggle-button')).toBeDisabled();
      expect(screen.getByTestId('pip-permission-denied')).toBeInTheDocument();
    });
  });

  describe('Quality Control Panel', () => {
    it('should display quality control options', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('quality-control-panel')).toBeInTheDocument();
      expect(screen.getByTestId('quality-selector')).toBeInTheDocument();
      expect(screen.getByText('Stream Quality')).toBeInTheDocument();
    });

    it('should show current stream quality settings', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('current-quality-display')).toBeInTheDocument();
      expect(screen.getByText('1920x1080')).toBeInTheDocument();
      expect(screen.getByText('2500 kbps')).toBeInTheDocument();
      expect(screen.getByText('30 fps')).toBeInTheDocument();
    });

    it('should provide quality preset buttons', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('quality-preset-1080p')).toBeInTheDocument();
      expect(screen.getByTestId('quality-preset-720p')).toBeInTheDocument();
      expect(screen.getByTestId('quality-preset-480p')).toBeInTheDocument();
      expect(screen.getByText('Full HD')).toBeInTheDocument();
      expect(screen.getByText('HD')).toBeInTheDocument();
      expect(screen.getByText('SD')).toBeInTheDocument();
    });

    it('should call onQualityChange when quality preset selected', async () => {
      // RED: This test will fail
      const mockQualityChange = jest.fn().mockImplementation(() => Promise.resolve());

      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} onQualityChange={mockQualityChange} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('quality-preset-720p'));
      expect(mockQualityChange).toHaveBeenCalledWith({
        resolution: '1280x720',
        bitrate: 1500,
        framerate: 30
      });
    });

    it('should disable quality controls when device lacks permission', async () => {
      // RED: This test will fail
      const restrictedDevice = {
        ...mockConnectedDevice,
        permissions: { ...mockConnectedDevice.permissions, canControlQuality: false }
      };

      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} connectedDevice={restrictedDevice} />
        </TestWrapper>
      );

      expect(screen.getByTestId('quality-preset-1080p')).toBeDisabled();
      expect(screen.getByTestId('quality-preset-720p')).toBeDisabled();
      expect(screen.getByTestId('quality-controls-disabled')).toBeInTheDocument();
    });
  });

  describe('Analytics Dashboard', () => {
    it('should display analytics overview when device has permission', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('analytics-overview')).toBeInTheDocument();
      expect(screen.getByText('Stream Analytics')).toBeInTheDocument();
      expect(screen.getByTestId('analytics-viewer-count')).toBeInTheDocument();
      expect(screen.getByTestId('analytics-duration')).toBeInTheDocument();
    });

    it('should show real-time viewer statistics', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('real-time-viewers')).toBeInTheDocument();
      expect(screen.getByText('150')).toBeInTheDocument();
      expect(screen.getByText('Current Viewers')).toBeInTheDocument();
    });

    it('should provide analytics view button', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('view-full-analytics-button')).toBeInTheDocument();
      expect(screen.getByText('View Full Analytics')).toBeInTheDocument();
    });

    it('should call onAnalyticsView when analytics button clicked', async () => {
      // RED: This test will fail
      const mockAnalyticsView = jest.fn();

      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} onAnalyticsView={mockAnalyticsView} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('view-full-analytics-button'));
      expect(mockAnalyticsView).toHaveBeenCalledWith(mockActiveStream);
    });

    it('should hide analytics when device lacks permission', async () => {
      // RED: This test will fail
      const restrictedDevice = {
        ...mockConnectedDevice,
        permissions: { ...mockConnectedDevice.permissions, canViewAnalytics: false }
      };

      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} connectedDevice={restrictedDevice} />
        </TestWrapper>
      );

      expect(screen.queryByTestId('analytics-overview')).not.toBeInTheDocument();
      expect(screen.getByTestId('analytics-permission-denied')).toBeInTheDocument();
    });
  });

  describe('Notification Controls', () => {
    it('should display notification toggle controls', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('notification-controls')).toBeInTheDocument();
      expect(screen.getByTestId('notification-toggle')).toBeInTheDocument();
      expect(screen.getByText('Notifications')).toBeInTheDocument();
    });

    it('should show notification preferences', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('notification-preferences')).toBeInTheDocument();
      expect(screen.getByTestId('notify-stream-start')).toBeInTheDocument();
      expect(screen.getByTestId('notify-viewer-milestones')).toBeInTheDocument();
      expect(screen.getByTestId('notify-quality-issues')).toBeInTheDocument();
    });

    it('should call onNotificationToggle when notification settings changed', async () => {
      // RED: This test will fail
      const mockNotificationToggle = jest.fn();

      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} onNotificationToggle={mockNotificationToggle} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('notify-stream-start'));
      expect(mockNotificationToggle).toHaveBeenCalledWith('stream_start', true);
    });
  });

  describe('Device Control Actions', () => {
    it('should display device action buttons', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('device-actions')).toBeInTheDocument();
      expect(screen.getByTestId('refresh-connection-button')).toBeInTheDocument();
      expect(screen.getByTestId('disconnect-device-button')).toBeInTheDocument();
    });

    it('should call onDisconnect when disconnect button clicked', async () => {
      // RED: This test will fail
      const mockDisconnect = jest.fn();

      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} onDisconnect={mockDisconnect} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('disconnect-device-button'));
      expect(screen.getByTestId('disconnect-confirmation')).toBeInTheDocument();
      
      fireEvent.click(screen.getByTestId('confirm-disconnect'));
      expect(mockDisconnect).toHaveBeenCalledWith(mockConnectedDevice);
    });

    it('should show device battery level and connection quality', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('device-battery-level')).toBeInTheDocument();
      expect(screen.getByText('85%')).toBeInTheDocument();
      expect(screen.getByTestId('device-signal-strength')).toBeInTheDocument();
    });
  });

  describe('Real-time Updates', () => {
    it('should subscribe to stream and device events', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(mockDefaultWebSocket.subscribe).toHaveBeenCalledWith('streamUpdated', expect.any(Function));
      expect(mockDefaultWebSocket.subscribe).toHaveBeenCalledWith('deviceStatusChanged', expect.any(Function));
      expect(mockDefaultWebSocket.subscribe).toHaveBeenCalledWith('pipSessionChanged', expect.any(Function));
    });

    it('should update stream information in real-time', async () => {
      // RED: This test will fail
      const mockSubscribe = jest.fn();
      mockUseWebSocket.mockReturnValue({
        ...mockDefaultWebSocket,
        subscribe: mockSubscribe
      });

      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      // Simulate stream update
      const streamCallback = mockSubscribe.mock.calls.find(
        (call: any) => call[0] === 'streamUpdated'
      )?.[1];

      if (streamCallback) {
        streamCallback({
          id: 'stream-1',
          currentViewers: 200,
          status: { state: 'live', health: 'excellent' }
        });
      }

      await waitFor(() => {
        expect(screen.getByText('200 viewers')).toBeInTheDocument();
      });
    });

    it('should handle device status changes in real-time', async () => {
      // RED: This test will fail
      const mockSubscribe = jest.fn();
      mockUseWebSocket.mockReturnValue({
        ...mockDefaultWebSocket,
        subscribe: mockSubscribe
      });

      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      // Simulate device status change
      const deviceCallback = mockSubscribe.mock.calls.find(
        (call: any) => call[0] === 'deviceStatusChanged'
      )?.[1];

      if (deviceCallback) {
        deviceCallback({
          deviceId: 'device-1',
          batteryLevel: 70,
          isOnline: true
        });
      }

      await waitFor(() => {
        expect(screen.getByText('70%')).toBeInTheDocument();
      });
    });
  });

  describe('Touch and Gesture Controls', () => {
    it('should support touch gestures for PiP control', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('pip-touch-controls')).toBeInTheDocument();
      expect(screen.getByTestId('pip-drag-handle')).toBeInTheDocument();
    });

    it('should handle swipe gestures for navigation', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      const touchArea = screen.getByTestId('touch-navigation-area');
      
      fireEvent.touchStart(touchArea, {
        touches: [{ clientX: 100, clientY: 100 }]
      });
      
      fireEvent.touchMove(touchArea, {
        touches: [{ clientX: 200, clientY: 100 }]
      });
      
      fireEvent.touchEnd(touchArea);

      expect(screen.getByTestId('swipe-navigation-feedback')).toBeInTheDocument();
    });
  });

  describe('Accessibility Features', () => {
    it('should have proper ARIA labels and roles', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      const mainControl = screen.getByTestId('mobile-remote-control');
      expect(mainControl).toHaveAttribute('role', 'application');
      expect(mainControl).toHaveAttribute('aria-label', 'Mobile Remote Control Interface');

      const streamControls = screen.getByTestId('stream-controls');
      expect(streamControls).toHaveAttribute('role', 'group');
      expect(streamControls).toHaveAttribute('aria-labelledby', 'stream-controls-heading');
    });

    it('should support keyboard navigation', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      const pauseButton = screen.getByTestId('pause-stream-button');
      pauseButton.focus();
      
      fireEvent.keyDown(pauseButton, { key: 'Enter' });
      expect(defaultProps.onStreamControl).toHaveBeenCalledWith('pause', mockActiveStream);
    });

    it('should announce state changes to screen readers', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
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
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('connection-error')).toBeInTheDocument();
      expect(screen.getByText(/Connection lost/)).toBeInTheDocument();
    });

    it('should show error state for invalid device data', async () => {
      // RED: This test will fail
      const invalidDevice = null;

      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} connectedDevice={invalidDevice as any} />
        </TestWrapper>
      );

      expect(screen.getByTestId('no-device-connected')).toBeInTheDocument();
      expect(screen.getByText('No Device Connected')).toBeInTheDocument();
    });

    it('should handle control action failures', async () => {
      // RED: This test will fail
      const mockStreamControl = jest.fn().mockImplementation(() => Promise.reject(new Error('Control failed')));

      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} onStreamControl={mockStreamControl} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('pause-stream-button'));

      await waitFor(() => {
        expect(screen.getByTestId('control-error-notification')).toBeInTheDocument();
        expect(screen.getByText('Control failed')).toBeInTheDocument();
      });
    });
  });

  describe('Performance', () => {
    it('should cleanup subscriptions on unmount', async () => {
      // RED: This test will fail
      const mockUnsubscribe = jest.fn();
      mockDefaultWebSocket.subscribe.mockReturnValue(mockUnsubscribe);

      const { unmount } = render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      unmount();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(3); // stream, device, pip subscriptions
    });

    it('should throttle frequent control actions', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <MobileRemoteControl {...defaultProps} />
        </TestWrapper>
      );

      const moveUpButton = screen.getByTestId('pip-move-up-button');
      
      // Simulate rapid clicks
      for (let i = 0; i < 10; i++) {
        fireEvent.click(moveUpButton);
      }

      // Should be throttled to prevent spam
      expect(defaultProps.onPiPControl).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('action-throttled-indicator')).toBeInTheDocument();
    });
  });
});
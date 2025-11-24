import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { StreamDashboard } from '@/components/StreamDashboard';
import { StreamProvider } from '@/contexts/StreamContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';

// TDD Phase 1: RED - Write failing tests for Stream Management Dashboard
// Following SOLID principles and comprehensive UI testing patterns

// Mock dependencies
jest.mock('@/hooks/useStream');
jest.mock('@/hooks/useWebSocket'); 
jest.mock('@/hooks/useAuth');
jest.mock('@/services/StreamService');

const mockUseStream = jest.mocked(require('@/hooks/useStream').useStream);
const mockUseWebSocket = jest.mocked(require('@/hooks/useWebSocket').useWebSocket);
const mockUseAuth = jest.mocked(require('@/hooks/useAuth').useAuth);

// Test wrapper with providers
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AuthProvider>
    <WebSocketProvider>
      <StreamProvider>
        {children}
      </StreamProvider>
    </WebSocketProvider>
  </AuthProvider>
);

describe('StreamDashboard (TDD)', () => {
  const mockStreams = [
    {
      id: 'stream-1',
      title: 'Live Gaming Stream',
      status: { state: 'live', health: 'good' },
      quality: { resolution: '1920x1080', bitrate: 2500, framerate: 30 },
      currentViewers: 42,
      isPublic: true,
      recordingEnabled: true,
      adDetectionEnabled: true,
      createdAt: new Date('2024-01-01T10:00:00Z'),
      thumbnailUrl: 'https://example.com/thumb1.jpg'
    },
    {
      id: 'stream-2', 
      title: 'Music Session',
      status: { state: 'idle', health: 'good' },
      quality: { resolution: '1280x720', bitrate: 1500, framerate: 30 },
      currentViewers: 0,
      isPublic: false,
      recordingEnabled: false,
      adDetectionEnabled: true,
      createdAt: new Date('2024-01-01T12:00:00Z'),
      thumbnailUrl: null
    }
  ];

  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    permissions: ['stream_create', 'stream_manage', 'analytics_view']
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock implementations
    mockUseAuth.mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      login: jest.fn(),
      logout: jest.fn(),
      loading: false
    });

    mockUseWebSocket.mockReturnValue({
      socket: null,
      isConnected: true,
      emit: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn()
    });

    mockUseStream.mockReturnValue({
      streams: mockStreams,
      loading: false,
      error: null,
      createStream: jest.fn(),
      updateStream: jest.fn(),
      deleteStream: jest.fn(),
      startStream: jest.fn(),
      stopStream: jest.fn(),
      pauseStream: jest.fn(),
      resumeStream: jest.fn(),
      refreshStreams: jest.fn()
    });
  });

  describe('Dashboard Layout and Navigation', () => {
    it('should render main dashboard layout with navigation', async () => {
      // RED: This test will fail because component doesn't exist yet
      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      expect(screen.getByTestId('stream-dashboard')).toBeInTheDocument();
      expect(screen.getByTestId('dashboard-header')).toBeInTheDocument();
      expect(screen.getByTestId('stream-controls')).toBeInTheDocument();
      expect(screen.getByTestId('stream-list')).toBeInTheDocument();
      expect(screen.getByTestId('dashboard-sidebar')).toBeInTheDocument();
    });

    it('should display user information and logout option', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      expect(screen.getByText('testuser')).toBeInTheDocument();
      expect(screen.getByTestId('user-menu')).toBeInTheDocument();
      
      fireEvent.click(screen.getByTestId('user-menu'));
      expect(screen.getByText('Logout')).toBeInTheDocument();
    });

    it('should show navigation tabs for different sections', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      expect(screen.getByRole('tab', { name: 'Active Streams' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Stream History' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Analytics' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument();
    });

    it('should switch between tabs and update content', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      const analyticsTab = screen.getByRole('tab', { name: 'Analytics' });
      fireEvent.click(analyticsTab);

      await waitFor(() => {
        expect(screen.getByTestId('analytics-panel')).toBeInTheDocument();
      });

      expect(analyticsTab).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('Stream List Display', () => {
    it('should display list of user streams with details', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      expect(screen.getByText('Live Gaming Stream')).toBeInTheDocument();
      expect(screen.getByText('Music Session')).toBeInTheDocument();
      
      expect(screen.getByText('42 viewers')).toBeInTheDocument();
      expect(screen.getByText('1920x1080')).toBeInTheDocument();
      expect(screen.getByTestId('stream-status-live')).toBeInTheDocument();
      expect(screen.getByTestId('stream-status-idle')).toBeInTheDocument();
    });

    it('should show stream thumbnails when available', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      const thumbnail = screen.getByAltText('Live Gaming Stream thumbnail');
      expect(thumbnail).toBeInTheDocument();
      expect(thumbnail).toHaveAttribute('src', 'https://example.com/thumb1.jpg');

      // Should show placeholder for streams without thumbnails
      expect(screen.getByTestId('stream-thumbnail-placeholder')).toBeInTheDocument();
    });

    it('should display stream health indicators', async () => {
      // RED: This test will fail
      mockUseStream.mockReturnValue({
        ...mockUseStream(),
        streams: [
          {
            ...mockStreams[0],
            status: { state: 'live', health: 'poor' }
          }
        ]
      });

      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      expect(screen.getByTestId('health-indicator-poor')).toBeInTheDocument();
      expect(screen.getByText('Connection Issues')).toBeInTheDocument();
    });

    it('should show loading state when streams are being fetched', async () => {
      // RED: This test will fail
      mockUseStream.mockReturnValue({
        ...mockUseStream(),
        loading: true,
        streams: []
      });

      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      expect(screen.getByTestId('streams-loading')).toBeInTheDocument();
      expect(screen.getByText('Loading streams...')).toBeInTheDocument();
    });

    it('should display empty state when no streams exist', async () => {
      // RED: This test will fail
      mockUseStream.mockReturnValue({
        ...mockUseStream(),
        streams: [],
        loading: false
      });

      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      expect(screen.getByTestId('empty-streams-state')).toBeInTheDocument();
      expect(screen.getByText('No streams found')).toBeInTheDocument();
      expect(screen.getByText('Create your first stream')).toBeInTheDocument();
    });
  });

  describe('Stream Controls and Actions', () => {
    it('should show start button for idle streams', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      const streamCard = screen.getByTestId('stream-card-stream-2');
      const startButton = within(streamCard).getByText('Start Stream');
      
      expect(startButton).toBeInTheDocument();
      expect(startButton).not.toBeDisabled();
    });

    it('should show stop and pause buttons for live streams', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      const streamCard = screen.getByTestId('stream-card-stream-1');
      
      expect(within(streamCard).getByText('Stop')).toBeInTheDocument();
      expect(within(streamCard).getByText('Pause')).toBeInTheDocument();
      expect(within(streamCard).queryByText('Start Stream')).not.toBeInTheDocument();
    });

    it('should call start stream function when start button clicked', async () => {
      // RED: This test will fail
      const mockStartStream = jest.fn();
      mockUseStream.mockReturnValue({
        ...mockUseStream(),
        startStream: mockStartStream
      });

      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      const startButton = screen.getByTestId('start-stream-stream-2');
      fireEvent.click(startButton);

      await waitFor(() => {
        expect(mockStartStream).toHaveBeenCalledWith('stream-2');
      });
    });

    it('should show confirmation dialog before stopping stream', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      const stopButton = screen.getByTestId('stop-stream-stream-1');
      fireEvent.click(stopButton);

      expect(screen.getByTestId('stop-confirmation-dialog')).toBeInTheDocument();
      expect(screen.getByText('Stop Live Stream?')).toBeInTheDocument();
      expect(screen.getByText('This will end the stream for all viewers.')).toBeInTheDocument();
    });

    it('should handle stream quality changes', async () => {
      // RED: This test will fail
      const mockUpdateStream = jest.fn();
      mockUseStream.mockReturnValue({
        ...mockUseStream(),
        updateStream: mockUpdateStream
      });

      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      const qualityButton = screen.getByTestId('quality-settings-stream-1');
      fireEvent.click(qualityButton);

      const qualitySelect = screen.getByTestId('quality-select');
      fireEvent.change(qualitySelect, { target: { value: '1280x720' } });

      const applyButton = screen.getByText('Apply');
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(mockUpdateStream).toHaveBeenCalledWith('stream-1', {
          quality: { resolution: '1280x720', bitrate: 1500, framerate: 30 }
        });
      });
    });
  });

  describe('Create New Stream Flow', () => {
    it('should show create stream button and open modal', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      const createButton = screen.getByTestId('create-stream-button');
      expect(createButton).toBeInTheDocument();

      fireEvent.click(createButton);
      expect(screen.getByTestId('create-stream-modal')).toBeInTheDocument();
    });

    it('should validate stream creation form inputs', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('create-stream-button'));

      const submitButton = screen.getByText('Create Stream');
      fireEvent.click(submitButton);

      expect(screen.getByText('Stream title is required')).toBeInTheDocument();
    });

    it('should create stream with valid form data', async () => {
      // RED: This test will fail
      const mockCreateStream = jest.fn().mockResolvedValue({ id: 'new-stream' });
      mockUseStream.mockReturnValue({
        ...mockUseStream(),
        createStream: mockCreateStream
      });

      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('create-stream-button'));

      fireEvent.change(screen.getByLabelText('Stream Title'), {
        target: { value: 'New Test Stream' }
      });

      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Test stream description' }
      });

      fireEvent.click(screen.getByLabelText('Public Stream'));
      fireEvent.click(screen.getByLabelText('Enable Recording'));

      const submitButton = screen.getByText('Create Stream');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockCreateStream).toHaveBeenCalledWith({
          title: 'New Test Stream',
          description: 'Test stream description',
          isPublic: true,
          recordingEnabled: true,
          adDetectionEnabled: true,
          quality: {
            resolution: '1920x1080',
            bitrate: 2500,
            framerate: 30,
            codec: 'h264'
          }
        });
      });
    });
  });

  describe('Real-time Updates via WebSocket', () => {
    it('should update stream status when websocket event received', async () => {
      // RED: This test will fail
      const mockSubscribe = jest.fn();
      mockUseWebSocket.mockReturnValue({
        ...mockUseWebSocket(),
        subscribe: mockSubscribe
      });

      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      // Verify WebSocket subscription was set up
      expect(mockSubscribe).toHaveBeenCalledWith(
        'streamStatusUpdate',
        expect.any(Function)
      );

      // Simulate status update
      const statusUpdateHandler = mockSubscribe.mock.calls.find(
        call => call[0] === 'streamStatusUpdate'
      )[1];

      statusUpdateHandler({
        streamId: 'stream-1',
        status: 'stopped',
        viewers: 0
      });

      await waitFor(() => {
        expect(screen.getByTestId('stream-status-stopped')).toBeInTheDocument();
      });
    });

    it('should show real-time viewer count updates', async () => {
      // RED: This test will fail
      const mockSubscribe = jest.fn();
      mockUseWebSocket.mockReturnValue({
        ...mockUseWebSocket(),
        subscribe: mockSubscribe
      });

      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      // Simulate viewer update
      const viewerUpdateHandler = mockSubscribe.mock.calls.find(
        call => call[0] === 'viewerCountUpdate'
      )[1];

      viewerUpdateHandler({
        streamId: 'stream-1',
        viewers: 55
      });

      await waitFor(() => {
        expect(screen.getByText('55 viewers')).toBeInTheDocument();
      });
    });

    it('should display ad detection notifications', async () => {
      // RED: This test will fail
      const mockSubscribe = jest.fn();
      mockUseWebSocket.mockReturnValue({
        ...mockUseWebSocket(),
        subscribe: mockSubscribe
      });

      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      // Simulate ad detection event
      const adDetectionHandler = mockSubscribe.mock.calls.find(
        call => call[0] === 'adDetected'
      )[1];

      adDetectionHandler({
        streamId: 'stream-1',
        type: 'commercial',
        confidence: 0.95,
        action: 'pip_enabled'
      });

      await waitFor(() => {
        expect(screen.getByTestId('ad-detection-notification')).toBeInTheDocument();
        expect(screen.getByText('Ad detected (95% confidence)')).toBeInTheDocument();
        expect(screen.getByText('Picture-in-Picture enabled')).toBeInTheDocument();
      });
    });
  });

  describe('Stream Analytics Preview', () => {
    it('should display basic analytics for each stream', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      const streamCard = screen.getByTestId('stream-card-stream-1');
      
      expect(within(streamCard).getByText('2h 15m')).toBeInTheDocument(); // Duration
      expect(within(streamCard).getByText('156 total views')).toBeInTheDocument();
      expect(within(streamCard).getByText('8 ads detected')).toBeInTheDocument();
    });

    it('should show analytics charts when expanded', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      const expandButton = screen.getByTestId('expand-analytics-stream-1');
      fireEvent.click(expandButton);

      await waitFor(() => {
        expect(screen.getByTestId('viewer-chart')).toBeInTheDocument();
        expect(screen.getByTestId('ad-detection-chart')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should display error message when stream operations fail', async () => {
      // RED: This test will fail
      const mockStartStream = jest.fn().mockRejectedValue(new Error('Stream start failed'));
      mockUseStream.mockReturnValue({
        ...mockUseStream(),
        startStream: mockStartStream
      });

      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('start-stream-stream-2'));

      await waitFor(() => {
        expect(screen.getByTestId('error-notification')).toBeInTheDocument();
        expect(screen.getByText('Failed to start stream')).toBeInTheDocument();
      });
    });

    it('should handle websocket disconnection gracefully', async () => {
      // RED: This test will fail
      mockUseWebSocket.mockReturnValue({
        ...mockUseWebSocket(),
        isConnected: false
      });

      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      expect(screen.getByTestId('connection-status-offline')).toBeInTheDocument();
      expect(screen.getByText('Reconnecting...')).toBeInTheDocument();
    });

    it('should show permission denied message for unauthorized actions', async () => {
      // RED: This test will fail
      mockUseAuth.mockReturnValue({
        ...mockUseAuth(),
        user: {
          ...mockUser,
          permissions: ['analytics_view'] // Missing stream_manage permission
        }
      });

      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      expect(screen.queryByTestId('create-stream-button')).not.toBeInTheDocument();
      expect(screen.getByText('View-only access')).toBeInTheDocument();
    });
  });

  describe('Mobile Responsiveness', () => {
    it('should adapt layout for mobile screens', async () => {
      // RED: This test will fail
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      });

      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      expect(screen.getByTestId('mobile-dashboard')).toBeInTheDocument();
      expect(screen.getByTestId('mobile-navigation')).toBeInTheDocument();
    });

    it('should show simplified stream cards on mobile', async () => {
      // RED: This test will fail
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      });

      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      expect(screen.getByTestId('mobile-stream-card-stream-1')).toBeInTheDocument();
      expect(screen.queryByTestId('desktop-stream-card-stream-1')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility Features', () => {
    it('should have proper ARIA labels and roles', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      expect(screen.getByRole('main')).toHaveAttribute('aria-label', 'Stream Dashboard');
      expect(screen.getByRole('tablist')).toBeInTheDocument();
      expect(screen.getAllByRole('tab')).toHaveLength(4);
    });

    it('should support keyboard navigation', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      const firstTab = screen.getByRole('tab', { name: 'Active Streams' });
      firstTab.focus();
      
      // Test tab navigation
      fireEvent.keyDown(firstTab, { key: 'ArrowRight' });
      expect(screen.getByRole('tab', { name: 'Stream History' })).toHaveFocus();
    });

    it('should announce live status changes to screen readers', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <StreamDashboard />
        </TestWrapper>
      );

      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    });
  });
});
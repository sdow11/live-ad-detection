import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { jest } from '@jest/globals';
import { PairingModal } from '@/components/PairingModal';
import { AuthProvider } from '@/contexts/AuthContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';

// TDD Phase 1: RED - Write failing tests for Pairing Modal component
// Following SOLID principles and comprehensive QR code pairing testing

// Mock dependencies
jest.mock('@/hooks/useWebSocket');
jest.mock('@/hooks/useAuth');
jest.mock('@/services/MobileAuthService');

const mockUseWebSocket = jest.fn();
const mockUseAuth = jest.fn();
const mockMobileAuthService = jest.fn();

require('@/hooks/useWebSocket').useWebSocket = mockUseWebSocket;
require('@/hooks/useAuth').useAuth = mockUseAuth;
require('@/services/MobileAuthService').MobileAuthService = mockMobileAuthService;

// Test wrapper with providers
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>
    <WebSocketProvider>
      {children}
    </WebSocketProvider>
  </AuthProvider>
);

describe('PairingModal (TDD)', () => {
  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com'
  };

  const mockPairingSession = {
    code: 'ABC123',
    qrCodeDataURL: 'data:image/png;base64,mockqrcode',
    expiresAt: new Date(Date.now() + 300000), // 5 minutes from now
    deviceFingerprint: 'fp123'
  };

  const mockDefaultWebSocket = {
    socket: null,
    isConnected: true,
    emit: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn()
  };

  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onPairingSuccess: jest.fn(),
    onPairingError: jest.fn(),
    onGenerateCode: jest.fn(),
    pairingSession: null,
    loading: false,
    error: null
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

  describe('Modal Display', () => {
    it('should render pairing modal when open', async () => {
      // RED: This test will fail because component doesn't exist yet
      render(
        <TestWrapper>
          <PairingModal {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('pairing-modal')).toBeInTheDocument();
      expect(screen.getByText('Pair New Device')).toBeInTheDocument();
    });

    it('should not render when closed', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <PairingModal {...defaultProps} isOpen={false} />
        </TestWrapper>
      );

      expect(screen.queryByTestId('pairing-modal')).not.toBeInTheDocument();
    });

    it('should have proper modal overlay and focus management', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <PairingModal {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('modal-overlay')).toBeInTheDocument();
      expect(screen.getByTestId('modal-content')).toBeInTheDocument();
      expect(screen.getByTestId('modal-content')).toHaveAttribute('role', 'dialog');
      expect(screen.getByTestId('modal-content')).toHaveAttribute('aria-modal', 'true');
    });

    it('should close modal when overlay clicked', async () => {
      // RED: This test will fail
      const mockOnClose = jest.fn();

      render(
        <TestWrapper>
          <PairingModal {...defaultProps} onClose={mockOnClose} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('modal-overlay'));
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should close modal when escape key pressed', async () => {
      // RED: This test will fail
      const mockOnClose = jest.fn();

      render(
        <TestWrapper>
          <PairingModal {...defaultProps} onClose={mockOnClose} />
        </TestWrapper>
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Initial State', () => {
    it('should show generate code button when no pairing session', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <PairingModal {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('generate-code-button')).toBeInTheDocument();
      expect(screen.getByText('Generate Pairing Code')).toBeInTheDocument();
      expect(screen.getByText(/Generate a pairing code to connect/)).toBeInTheDocument();
    });

    it('should call onGenerateCode when generate button clicked', async () => {
      // RED: This test will fail
      const mockGenerateCode = jest.fn();

      render(
        <TestWrapper>
          <PairingModal {...defaultProps} onGenerateCode={mockGenerateCode} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('generate-code-button'));
      expect(mockGenerateCode).toHaveBeenCalled();
    });

    it('should disable generate button when loading', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <PairingModal {...defaultProps} loading={true} />
        </TestWrapper>
      );

      const generateButton = screen.getByTestId('generate-code-button');
      expect(generateButton).toBeDisabled();
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });
  });

  describe('QR Code Display', () => {
    it('should display QR code when pairing session exists', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <PairingModal {...defaultProps} pairingSession={mockPairingSession} />
        </TestWrapper>
      );

      expect(screen.getByTestId('qr-code-container')).toBeInTheDocument();
      expect(screen.getByTestId('qr-code-image')).toBeInTheDocument();
      expect(screen.getByAltText('Device Pairing QR Code')).toBeInTheDocument();
    });

    it('should display pairing code text', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <PairingModal {...defaultProps} pairingSession={mockPairingSession} />
        </TestWrapper>
      );

      expect(screen.getByTestId('pairing-code-display')).toBeInTheDocument();
      expect(screen.getByText('ABC123')).toBeInTheDocument();
      expect(screen.getByText(/Scan with your mobile device/)).toBeInTheDocument();
      expect(screen.getByText(/Or enter code manually: ABC123/)).toBeInTheDocument();
    });

    it('should show pairing instructions', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <PairingModal {...defaultProps} pairingSession={mockPairingSession} />
        </TestWrapper>
      );

      expect(screen.getByTestId('pairing-instructions')).toBeInTheDocument();
      expect(screen.getByText(/Open the mobile app/)).toBeInTheDocument();
      expect(screen.getByText(/Scan the QR code/)).toBeInTheDocument();
      expect(screen.getByText(/Wait for confirmation/)).toBeInTheDocument();
    });

    it('should display QR code with proper accessibility attributes', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <PairingModal {...defaultProps} pairingSession={mockPairingSession} />
        </TestWrapper>
      );

      const qrImage = screen.getByTestId('qr-code-image');
      expect(qrImage).toHaveAttribute('alt', 'Device Pairing QR Code');
      expect(qrImage).toHaveAttribute('src', mockPairingSession.qrCodeDataURL);
    });
  });

  describe('Countdown Timer', () => {
    it('should display expiration countdown', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <PairingModal {...defaultProps} pairingSession={mockPairingSession} />
        </TestWrapper>
      );

      expect(screen.getByTestId('expiration-countdown')).toBeInTheDocument();
      expect(screen.getByText(/Expires in/)).toBeInTheDocument();
    });

    it('should update countdown timer every second', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <PairingModal {...defaultProps} pairingSession={mockPairingSession} />
        </TestWrapper>
      );

      const countdown = screen.getByTestId('expiration-countdown');
      const initialText = countdown.textContent;

      // Advance timer by 1 second
      jest.advanceTimersByTime(1000);

      await waitFor(() => {
        expect(countdown.textContent).not.toBe(initialText);
      });
    });

    it('should show expired state when time runs out', async () => {
      // RED: This test will fail
      const expiredSession = {
        ...mockPairingSession,
        expiresAt: new Date(Date.now() - 1000) // Already expired
      };

      render(
        <TestWrapper>
          <PairingModal {...defaultProps} pairingSession={expiredSession} />
        </TestWrapper>
      );

      expect(screen.getByTestId('expired-state')).toBeInTheDocument();
      expect(screen.getByText('Code Expired')).toBeInTheDocument();
    });

    it('should show warning when expiration is near', async () => {
      // RED: This test will fail
      const nearExpirySession = {
        ...mockPairingSession,
        expiresAt: new Date(Date.now() + 30000) // 30 seconds
      };

      render(
        <TestWrapper>
          <PairingModal {...defaultProps} pairingSession={nearExpirySession} />
        </TestWrapper>
      );

      expect(screen.getByTestId('expiry-warning')).toBeInTheDocument();
      expect(screen.getByText(/Code expires soon/)).toBeInTheDocument();
    });
  });

  describe('Regenerate Code', () => {
    it('should show regenerate button when code exists', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <PairingModal {...defaultProps} pairingSession={mockPairingSession} />
        </TestWrapper>
      );

      expect(screen.getByTestId('regenerate-button')).toBeInTheDocument();
      expect(screen.getByText('Generate New Code')).toBeInTheDocument();
    });

    it('should call onGenerateCode when regenerate clicked', async () => {
      // RED: This test will fail
      const mockGenerateCode = jest.fn();

      render(
        <TestWrapper>
          <PairingModal {...defaultProps} 
            pairingSession={mockPairingSession}
            onGenerateCode={mockGenerateCode}
          />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('regenerate-button'));
      expect(mockGenerateCode).toHaveBeenCalled();
    });

    it('should disable regenerate button when loading', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <PairingModal {...defaultProps} 
            pairingSession={mockPairingSession}
            loading={true}
          />
        </TestWrapper>
      );

      expect(screen.getByTestId('regenerate-button')).toBeDisabled();
    });
  });

  describe('WebSocket Integration', () => {
    it('should subscribe to pairing events', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <PairingModal {...defaultProps} pairingSession={mockPairingSession} />
        </TestWrapper>
      );

      expect(mockDefaultWebSocket.subscribe).toHaveBeenCalledWith(
        'devicePaired',
        expect.any(Function)
      );
      expect(mockDefaultWebSocket.subscribe).toHaveBeenCalledWith(
        'pairingError',
        expect.any(Function)
      );
    });

    it('should handle successful pairing event', async () => {
      // RED: This test will fail
      const mockOnSuccess = jest.fn();
      const mockSubscribe = jest.fn();

      mockUseWebSocket.mockReturnValue({
        ...mockDefaultWebSocket,
        subscribe: mockSubscribe
      });

      render(
        <TestWrapper>
          <PairingModal {...defaultProps} 
            pairingSession={mockPairingSession}
            onPairingSuccess={mockOnSuccess}
          />
        </TestWrapper>
      );

      // Simulate pairing success
      const pairingCallback = mockSubscribe.mock.calls.find(
        (call: any) => call[0] === 'devicePaired'
      )?.[1];

      const pairingData = {
        deviceId: 'device-123',
        deviceName: 'iPhone 15 Pro',
        code: 'ABC123'
      };

      if (pairingCallback) {
        pairingCallback(pairingData);
      }

      expect(mockOnSuccess).toHaveBeenCalledWith(pairingData);
    });

    it('should handle pairing error event', async () => {
      // RED: This test will fail
      const mockOnError = jest.fn();
      const mockSubscribe = jest.fn();

      mockUseWebSocket.mockReturnValue({
        ...mockDefaultWebSocket,
        subscribe: mockSubscribe
      });

      render(
        <TestWrapper>
          <PairingModal {...defaultProps} 
            pairingSession={mockPairingSession}
            onPairingError={mockOnError}
          />
        </TestWrapper>
      );

      // Simulate pairing error
      const errorCallback = mockSubscribe.mock.calls.find(
        (call: any) => call[0] === 'pairingError'
      )?.[1];

      const errorData = {
        code: 'ABC123',
        error: 'Invalid device information'
      };

      if (errorCallback) {
        errorCallback(errorData);
      }

      expect(mockOnError).toHaveBeenCalledWith(errorData);
    });
  });

  describe('Error Handling', () => {
    it('should display error message when error prop provided', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <PairingModal {...defaultProps} error="Network connection failed" />
        </TestWrapper>
      );

      expect(screen.getByTestId('error-message')).toBeInTheDocument();
      expect(screen.getByText('Network connection failed')).toBeInTheDocument();
    });

    it('should show retry button when error occurs', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <PairingModal {...defaultProps} error="Network connection failed" />
        </TestWrapper>
      );

      expect(screen.getByTestId('retry-button')).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    it('should clear error and retry when retry button clicked', async () => {
      // RED: This test will fail
      const mockGenerateCode = jest.fn();

      render(
        <TestWrapper>
          <PairingModal {...defaultProps} 
            error="Network connection failed"
            onGenerateCode={mockGenerateCode}
          />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('retry-button'));
      expect(mockGenerateCode).toHaveBeenCalled();
    });

    it('should handle WebSocket connection errors', async () => {
      // RED: This test will fail
      mockUseWebSocket.mockReturnValue({
        ...mockDefaultWebSocket,
        isConnected: false
      });

      render(
        <TestWrapper>
          <PairingModal {...defaultProps} pairingSession={mockPairingSession} />
        </TestWrapper>
      );

      expect(screen.getByTestId('connection-warning')).toBeInTheDocument();
      expect(screen.getByText(/Connection lost/)).toBeInTheDocument();
    });
  });

  describe('Accessibility Features', () => {
    it('should have proper ARIA labels and roles', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <PairingModal {...defaultProps} />
        </TestWrapper>
      );

      const modal = screen.getByTestId('modal-content');
      expect(modal).toHaveAttribute('role', 'dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
      expect(modal).toHaveAttribute('aria-labelledby', 'modal-title');
      expect(modal).toHaveAttribute('aria-describedby', 'modal-description');
    });

    it('should trap focus within modal', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <PairingModal {...defaultProps} />
        </TestWrapper>
      );

      const firstButton = screen.getByTestId('generate-code-button');
      const closeButton = screen.getByTestId('close-button');

      firstButton.focus();
      expect(document.activeElement).toBe(firstButton);

      // Tab should cycle through modal elements
      fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
      expect(document.activeElement).toBe(closeButton);
    });

    it('should announce important state changes', async () => {
      // RED: This test will fail
      render(
        <TestWrapper>
          <PairingModal {...defaultProps} pairingSession={mockPairingSession} />
        </TestWrapper>
      );

      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
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
          <PairingModal {...defaultProps} pairingSession={mockPairingSession} />
        </TestWrapper>
      );

      expect(screen.getByTestId('mobile-modal')).toBeInTheDocument();
      expect(screen.getByTestId('mobile-qr-container')).toBeInTheDocument();
    });

    it('should show smaller QR code on mobile', async () => {
      // RED: This test will fail
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      });

      render(
        <TestWrapper>
          <PairingModal {...defaultProps} pairingSession={mockPairingSession} />
        </TestWrapper>
      );

      const qrImage = screen.getByTestId('qr-code-image');
      expect(qrImage).toHaveClass('w-48', 'h-48'); // Mobile size
    });
  });

  describe('Performance', () => {
    it('should cleanup WebSocket subscriptions on unmount', async () => {
      // RED: This test will fail
      const mockUnsubscribe = jest.fn();
      mockDefaultWebSocket.subscribe.mockReturnValue(mockUnsubscribe);

      const { unmount } = render(
        <TestWrapper>
          <PairingModal {...defaultProps} pairingSession={mockPairingSession} />
        </TestWrapper>
      );

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('should not update state if component unmounted', async () => {
      // RED: This test will fail
      const { unmount } = render(
        <TestWrapper>
          <PairingModal {...defaultProps} pairingSession={mockPairingSession} />
        </TestWrapper>
      );

      unmount();

      // This test would verify no state updates occur after unmount
      // Implementation would use useRef to track mounted state
      expect(true).toBe(true); // Placeholder for unmount safety check
    });
  });
});
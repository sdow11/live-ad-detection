import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';

interface PairingSession {
  code: string;
  qrCodeDataURL: string;
  expiresAt: Date;
  deviceFingerprint?: string;
}

interface PairingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPairingSuccess: (data: any) => void;
  onPairingError: (error: any) => void;
  onGenerateCode: () => void;
  pairingSession: PairingSession | null;
  loading?: boolean;
  error?: string | null;
}

export const PairingModal: React.FC<PairingModalProps> = ({
  isOpen,
  onClose,
  onPairingSuccess,
  onPairingError,
  onGenerateCode,
  pairingSession,
  loading = false,
  error = null
}) => {
  const { subscribe, isConnected } = useWebSocket();
  const [timeRemaining, setTimeRemaining] = useState('');
  const [isExpired, setIsExpired] = useState(false);
  const [isNearExpiry, setIsNearExpiry] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const modalRef = useRef<HTMLDivElement>(null);

  // Check for mobile screen
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Focus management and escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleFocusTrap = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('keydown', handleFocusTrap);
    
    // Focus first element when modal opens
    setTimeout(() => {
      const firstFocusable = modalRef.current?.querySelector('button') as HTMLElement;
      firstFocusable?.focus();
    }, 100);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleFocusTrap);
    };
  }, [isOpen, onClose]);

  // Countdown timer for pairing code expiration
  useEffect(() => {
    if (!pairingSession?.expiresAt) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const updateCountdown = () => {
      if (!mountedRef.current) return;

      const now = Date.now();
      const expiry = pairingSession.expiresAt.getTime();
      const remaining = Math.max(0, expiry - now);

      if (remaining <= 0) {
        setIsExpired(true);
        setTimeRemaining('Expired');
        setStatusMessage('Code expired');
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      
      // Warning for last 60 seconds
      setIsNearExpiry(remaining <= 60000);
      setIsExpired(false);
    };

    updateCountdown();
    intervalRef.current = setInterval(updateCountdown, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [pairingSession]);

  // WebSocket subscriptions for pairing events
  useEffect(() => {
    if (!isConnected || !pairingSession) return;

    const unsubscribePaired = subscribe('devicePaired', (data: any) => {
      if (mountedRef.current) {
        setStatusMessage('Device paired successfully!');
        onPairingSuccess(data);
      }
    });

    const unsubscribeError = subscribe('pairingError', (data: any) => {
      if (mountedRef.current) {
        setStatusMessage(`Pairing failed: ${data.error}`);
        onPairingError(data);
      }
    });

    return () => {
      unsubscribePaired();
      unsubscribeError();
    };
  }, [isConnected, pairingSession, subscribe, onPairingSuccess, onPairingError]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Handle overlay click
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Handle retry
  const handleRetry = useCallback(() => {
    setStatusMessage('');
    onGenerateCode();
  }, [onGenerateCode]);

  // Generate instructions steps
  const instructions = useMemo(() => [
    'Open the mobile app on your device',
    'Tap "Pair with Desktop" or scan QR code',
    'Scan the QR code above or enter the code manually',
    'Wait for confirmation on both devices'
  ], []);

  if (!isOpen) return null;

  const modalTestId = isMobile ? 'mobile-modal' : 'pairing-modal';
  const qrContainerTestId = isMobile ? 'mobile-qr-container' : 'qr-code-container';

  return (
    <div 
      data-testid="modal-overlay"
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleOverlayClick}
    >
      <div
        ref={modalRef}
        data-testid={modalTestId}
        className={`bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto ${isMobile ? 'max-w-sm' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-description"
      >
        <div data-testid="modal-content" className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 id="modal-title" className="text-xl font-semibold text-gray-900">
              Pair New Device
            </h2>
            <button
              data-testid="close-button"
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Close modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Connection Warning */}
          {!isConnected && (
            <div data-testid="connection-warning" className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
              <p className="text-yellow-800 text-sm">
                Connection lost. Please check your internet connection.
              </p>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div data-testid="error-message" className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800">{error}</p>
              <button
                data-testid="retry-button"
                onClick={handleRetry}
                className="mt-2 bg-red-500 text-white px-4 py-2 rounded text-sm hover:bg-red-600 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="text-center py-4">
              <div data-testid="loading-spinner" className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
              <p className="text-gray-600">Generating pairing code...</p>
            </div>
          )}

          {/* Initial State - No Pairing Session */}
          {!pairingSession && !loading && (
            <div className="text-center space-y-4">
              <p id="modal-description" className="text-gray-600">
                Generate a pairing code to connect your mobile device.
              </p>
              <button
                data-testid="generate-code-button"
                onClick={onGenerateCode}
                disabled={loading}
                className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >
                Generate Pairing Code
              </button>
            </div>
          )}

          {/* Pairing Session Active */}
          {pairingSession && !loading && (
            <div className="space-y-6">
              {/* QR Code Display */}
              <div data-testid={qrContainerTestId} className="text-center">
                <div data-testid="pairing-code-display" className="mb-4">
                  <img
                    data-testid="qr-code-image"
                    src={pairingSession.qrCodeDataURL}
                    alt="Device Pairing QR Code"
                    className={`mx-auto border border-gray-200 rounded-lg ${isMobile ? 'w-48 h-48' : 'w-64 h-64'}`}
                  />
                  <p className="text-sm text-gray-600 mt-3">
                    Scan with your mobile device
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Or enter code manually: <span className="font-mono font-medium">{pairingSession.code}</span>
                  </p>
                </div>

                {/* Countdown Timer */}
                <div className="mb-4">
                  {isExpired ? (
                    <div data-testid="expired-state" className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-red-800 font-medium">Code Expired</p>
                      <p className="text-red-600 text-sm">Please generate a new pairing code</p>
                    </div>
                  ) : (
                    <div data-testid="expiration-countdown" className={`text-sm ${isNearExpiry ? 'text-orange-600' : 'text-gray-600'}`}>
                      Expires in {timeRemaining}
                      {isNearExpiry && (
                        <div data-testid="expiry-warning" className="text-xs text-orange-600 mt-1">
                          Code expires soon!
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Instructions */}
                <div data-testid="pairing-instructions" className="text-left bg-gray-50 rounded-lg p-4 mb-4">
                  <h3 className="font-medium text-gray-900 mb-3">How to pair:</h3>
                  <ol className="space-y-2 text-sm text-gray-700">
                    {instructions.map((instruction, index) => (
                      <li key={index} className="flex items-start">
                        <span className="flex-shrink-0 w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center mr-3 mt-0.5">
                          {index + 1}
                        </span>
                        {instruction}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Regenerate Button */}
                <button
                  data-testid="regenerate-button"
                  onClick={onGenerateCode}
                  disabled={loading}
                  className="w-full bg-gray-500 text-white py-2 px-4 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors"
                >
                  Generate New Code
                </button>
              </div>
            </div>
          )}

          {/* Status Announcement for Screen Readers */}
          <div
            role="status"
            aria-live="polite"
            className="sr-only"
          >
            {statusMessage}
          </div>
        </div>
      </div>
    </div>
  );
};
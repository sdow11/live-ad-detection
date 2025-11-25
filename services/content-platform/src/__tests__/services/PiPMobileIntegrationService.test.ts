import { PiPMobileIntegrationService } from '@/services/PiPMobileIntegrationService';
import { ISmartPiPAutomationService } from '@/interfaces/ISmartPiPAutomationService';
import { IMobileRemoteService } from '@/interfaces/IMobileRemoteService';
import { jest } from '@jest/globals';

// TDD Phase: Integration tests for PiP Mobile Integration
describe('PiPMobileIntegrationService', () => {
  let integrationService: PiPMobileIntegrationService;
  let mockSmartPiPService: ISmartPiPAutomationService;
  let mockMobileRemoteService: IMobileRemoteService;

  const mockPiPActivationData = {
    streamId: 'stream-1',
    pipActive: true,
    content: {
      id: 'content-1',
      title: 'Replacement Content',
      url: 'test.mp4',
      duration: 30000,
      type: 'entertainment'
    },
    timestamp: new Date(),
    position: { x: 100, y: 100 },
    size: { width: 320, height: 180 }
  };

  const mockPiPDeactivationData = {
    streamId: 'stream-1',
    sessionDuration: 30000,
    timestamp: new Date(),
    reason: 'ad_ended'
  };

  const mockMobileCommand = {
    deviceId: 'mobile-1',
    command: 'disable_auto_pip' as const,
    timestamp: new Date()
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Smart PiP Service
    mockSmartPiPService = {
      initialize: jest.fn().mockImplementation(() => Promise.resolve()),
      shutdown: jest.fn().mockImplementation(() => Promise.resolve()),
      handleAdDetection: jest.fn().mockImplementation(() => Promise.resolve()),
      handleAdDetectionEnd: jest.fn().mockImplementation(() => Promise.resolve()),
      getPiPMetrics: jest.fn().mockImplementation(() => Promise.resolve({
        totalActivations: 5,
        averageSwitchTime: 85,
        successRate: 95,
        userEngagement: 4.2,
        contentReplacementRate: 80
      })),
      onPiPActivation: jest.fn(),
      onPiPDeactivation: jest.fn(),
      onError: jest.fn(),
      handleMobileCommand: jest.fn().mockImplementation(() => Promise.resolve())
    } as any;

    // Mock Mobile Remote Service
    mockMobileRemoteService = {
      sendAdDetectionNotification: jest.fn().mockImplementation(() => Promise.resolve()),
      sendPipStatusUpdate: jest.fn().mockImplementation(() => Promise.resolve()),
      broadcastStreamStatus: jest.fn().mockImplementation(() => Promise.resolve())
    } as any;

    integrationService = new PiPMobileIntegrationService(
      mockSmartPiPService,
      mockMobileRemoteService
    );
  });

  describe('Initialization', () => {
    it('should initialize and register event handlers', async () => {
      await integrationService.initialize();

      expect(mockSmartPiPService.onPiPActivation).toHaveBeenCalledWith(expect.any(Function));
      expect(mockSmartPiPService.onPiPDeactivation).toHaveBeenCalledWith(expect.any(Function));
      expect(mockSmartPiPService.onError).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should not initialize twice', async () => {
      await integrationService.initialize();
      await integrationService.initialize();

      expect(mockSmartPiPService.onPiPActivation).toHaveBeenCalledTimes(1);
    });
  });

  describe('PiP Event Handling', () => {
    beforeEach(async () => {
      await integrationService.initialize();
    });

    it('should send mobile notification when PiP is activated', async () => {
      // Get the registered callback
      const activationCallback = (mockSmartPiPService.onPiPActivation as any).mock.calls[0][0];
      
      // Simulate PiP activation
      await activationCallback(mockPiPActivationData);

      expect(mockMobileRemoteService.sendAdDetectionNotification).toHaveBeenCalled();
      const notificationCall = (mockMobileRemoteService.sendAdDetectionNotification as any).mock.calls[0];
      expect(notificationCall[0]).toBe('default');
      expect(notificationCall[1].streamId).toBe('stream-1');
      expect(notificationCall[1].action).toBe('pip_enabled');
      expect(notificationCall[1].type).toBe('commercial');

      expect(mockMobileRemoteService.sendPipStatusUpdate).toHaveBeenCalledWith(
        'default',
        expect.objectContaining({
          streamId: 'stream-1',
          isEnabled: true,
          position: { x: 100, y: 100 },
          size: { width: 320, height: 180 },
          reason: 'ad_detected'
        })
      );
    });

    it('should send mobile notification when PiP is deactivated', async () => {
      const deactivationCallback = (mockSmartPiPService.onPiPDeactivation as any).mock.calls[0][0];
      
      await deactivationCallback(mockPiPDeactivationData);

      expect(mockMobileRemoteService.sendPipStatusUpdate).toHaveBeenCalledWith(
        'default',
        expect.objectContaining({
          streamId: 'stream-1',
          isEnabled: false,
          reason: 'stream_ended'
        })
      );
    });

    it('should handle PiP errors and notify mobile devices', async () => {
      const errorCallback = (mockSmartPiPService.onError as any).mock.calls[0][0];
      
      const mockError = {
        code: 'DETECTION_HANDLING_ERROR',
        message: 'Failed to handle ad detection',
        timestamp: new Date(),
        context: {
          detection: {
            streamId: 'stream-1'
          }
        }
      };

      await errorCallback(mockError);

      expect(mockMobileRemoteService.sendAdDetectionNotification).toHaveBeenCalled();
      const errorNotificationCall = (mockMobileRemoteService.sendAdDetectionNotification as any).mock.calls[0];
      expect(errorNotificationCall[0]).toBe('default');
      expect(errorNotificationCall[1].streamId).toBe('stream-1');
      expect(errorNotificationCall[1].action).toBe('none');
      expect(errorNotificationCall[1].type).toBe('unknown');
    });
  });

  describe('Mobile Command Integration', () => {
    beforeEach(async () => {
      await integrationService.initialize();
    });

    it('should forward mobile commands to Smart PiP service', async () => {
      const result = await integrationService.handleMobileCommand('mobile-1', mockMobileCommand);

      expect(mockSmartPiPService.handleMobileCommand).toHaveBeenCalledWith(mockMobileCommand);
      expect(result.success).toBe(true);
      expect(result.result?.message).toBe('Command executed successfully');
    });

    it('should handle mobile command failures gracefully', async () => {
      (mockSmartPiPService.handleMobileCommand as any).mockRejectedValue(new Error('Service unavailable'));

      const result = await integrationService.handleMobileCommand('mobile-1', mockMobileCommand);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Service unavailable');
    });
  });

  describe('Status Synchronization', () => {
    beforeEach(async () => {
      await integrationService.initialize();
    });

    it('should provide current PiP status for mobile UI', async () => {
      // Simulate active PiP session
      const activationCallback = (mockSmartPiPService.onPiPActivation as any).mock.calls[0][0];
      await activationCallback(mockPiPActivationData);

      const status = await integrationService.getPiPStatusForMobile('stream-1');

      expect(status.streamId).toBe('stream-1');
      expect(status.isEnabled).toBe(true);
      expect(status.reason).toBe('ad_detected');
      expect(status.timestamp).toBeDefined();
    });

    it('should return inactive status when no PiP session exists', async () => {
      const status = await integrationService.getPiPStatusForMobile('stream-1');

      expect(status.streamId).toBe('stream-1');
      expect(status.isEnabled).toBe(false);
      expect(status.reason).toBe('user_action');
      expect(status.timestamp).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await integrationService.initialize();
    });

    it('should handle mobile service failures gracefully', async () => {
      (mockMobileRemoteService.sendAdDetectionNotification as any).mockRejectedValue(new Error('Network error'));
      
      const activationCallback = (mockSmartPiPService.onPiPActivation as any).mock.calls[0][0];
      
      // Should not throw
      await expect(activationCallback(mockPiPActivationData)).resolves.not.toThrow();
    });

    it('should handle missing detection context in errors', async () => {
      const errorCallback = (mockSmartPiPService.onError as any).mock.calls[0][0];
      
      const mockErrorWithoutContext = {
        code: 'GENERAL_ERROR',
        message: 'Generic error',
        timestamp: new Date()
      };

      await expect(errorCallback(mockErrorWithoutContext)).resolves.not.toThrow();
      
      expect(mockMobileRemoteService.sendAdDetectionNotification).toHaveBeenCalledWith(
        'default',
        expect.objectContaining({
          streamId: 'unknown'
        })
      );
    });
  });

  describe('Cleanup', () => {
    it('should clean up resources on shutdown', async () => {
      await integrationService.initialize();
      
      // Add some active notifications
      const activationCallback = (mockSmartPiPService.onPiPActivation as any).mock.calls[0][0];
      await activationCallback(mockPiPActivationData);

      await integrationService.shutdown();

      // Should clear internal state
      const status = await integrationService.getPiPStatusForMobile('stream-1');
      expect(status.isEnabled).toBe(false);
    });
  });
});
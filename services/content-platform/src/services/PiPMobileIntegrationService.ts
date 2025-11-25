import { ISmartPiPAutomationService } from '@/interfaces/ISmartPiPAutomationService';
import { IMobileRemoteService } from '@/interfaces/IMobileRemoteService';
import { 
  AdDetection,
  PiPActivationData,
  PiPDeactivationData,
  SmartPiPError,
  MobileCommand
} from '@/interfaces/ISmartPiPAutomationService';
import {
  AdDetectionNotification,
  PipStatusUpdate,
  CommandResult
} from '@/interfaces/IMobileRemoteService';

/**
 * PiP Mobile Integration Service
 * 
 * Bridges Smart PiP Automation with Mobile Remote Control to enable:
 * - Real-time ad detection notifications to mobile devices
 * - Mobile control of PiP automation behavior
 * - Synchronized state between automation and mobile interfaces
 * 
 * Following SOLID principles:
 * - Single Responsibility: Integration between PiP automation and mobile control
 * - Open/Closed: Extensible for new integration patterns
 * - Liskov Substitution: Implements clear integration contracts
 * - Interface Segregation: Focused integration interface
 * - Dependency Inversion: Depends on abstractions, not implementations
 */
export class PiPMobileIntegrationService {
  private isInitialized = false;
  private activeNotifications = new Map<string, AdDetectionNotification>();

  constructor(
    private readonly smartPiPService: ISmartPiPAutomationService,
    private readonly mobileRemoteService: IMobileRemoteService
  ) {}

  /**
   * Initialize integration service and set up event handlers
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Subscribe to Smart PiP events
    this.smartPiPService.onPiPActivation(this.handlePiPActivation.bind(this));
    this.smartPiPService.onPiPDeactivation(this.handlePiPDeactivation.bind(this));
    this.smartPiPService.onError(this.handlePiPError.bind(this));

    this.isInitialized = true;
  }

  /**
   * Handle PiP activation - notify mobile devices
   */
  private async handlePiPActivation(data: PiPActivationData): Promise<void> {
    try {
      // Create mobile notification for ad detection
      const notification: AdDetectionNotification = {
        streamId: data.streamId,
        type: 'commercial', // Default for now, could be enhanced based on detection data
        confidence: 0.92, // Should come from detection data
        timestamp: data.timestamp,
        action: 'pip_enabled',
        duration: 30, // Should come from detection data
        metadata: {
          skipable: true
        }
      };

      // Store notification for tracking
      this.activeNotifications.set(data.streamId, notification);

      // Send to all user's mobile devices
      await this.mobileRemoteService.sendAdDetectionNotification('default', notification);

      // Send PiP status update
      const pipStatus: PipStatusUpdate = {
        streamId: data.streamId,
        isEnabled: true,
        position: data.position,
        size: data.size,
        timestamp: data.timestamp,
        reason: 'ad_detected'
      };

      await this.mobileRemoteService.sendPipStatusUpdate('default', pipStatus);

    } catch (error) {
      console.error('Failed to handle PiP activation for mobile:', error);
    }
  }

  /**
   * Handle PiP deactivation - notify mobile devices
   */
  private async handlePiPDeactivation(data: PiPDeactivationData): Promise<void> {
    try {
      // Send PiP status update
      const pipStatus: PipStatusUpdate = {
        streamId: data.streamId,
        isEnabled: false,
        timestamp: data.timestamp,
        reason: data.reason === 'ad_ended' ? 'stream_ended' : 'user_action'
      };

      await this.mobileRemoteService.sendPipStatusUpdate('default', pipStatus);

      // Clean up stored notification
      this.activeNotifications.delete(data.streamId);

    } catch (error) {
      console.error('Failed to handle PiP deactivation for mobile:', error);
    }
  }

  /**
   * Handle PiP errors - notify mobile devices
   */
  private async handlePiPError(error: SmartPiPError): Promise<void> {
    try {
      // Create error notification for mobile
      const notification: AdDetectionNotification = {
        streamId: error.context?.detection?.streamId || 'unknown',
        type: 'unknown',
        confidence: 0,
        timestamp: error.timestamp,
        action: 'none',
        metadata: {
          skipable: false
        }
      };

      await this.mobileRemoteService.sendAdDetectionNotification('default', notification);

    } catch (mobileError) {
      console.error('Failed to send error notification to mobile:', mobileError);
    }
  }

  /**
   * Handle mobile commands that affect PiP automation
   */
  async handleMobileCommand(deviceId: string, command: MobileCommand): Promise<CommandResult> {
    try {
      // Forward command to Smart PiP service
      await this.smartPiPService.handleMobileCommand(command);

      return {
        success: true,
        commandId: `mobile-${Date.now()}`,
        result: { message: 'Command executed successfully' },
        timestamp: new Date()
      };

    } catch (error) {
      return {
        success: false,
        commandId: `mobile-${Date.now()}`,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  }

  /**
   * Get current PiP status for mobile device UI
   */
  async getPiPStatusForMobile(streamId: string): Promise<PipStatusUpdate> {
    try {
      const metrics = await this.smartPiPService.getPiPMetrics();
      const notification = this.activeNotifications.get(streamId);

      return {
        streamId,
        isEnabled: notification !== undefined,
        timestamp: new Date(),
        reason: notification ? 'ad_detected' : 'user_action'
      };

    } catch (error) {
      return {
        streamId,
        isEnabled: false,
        timestamp: new Date(),
        reason: 'error'
      };
    }
  }

  /**
   * Shutdown integration service
   */
  async shutdown(): Promise<void> {
    this.activeNotifications.clear();
    this.isInitialized = false;
  }
}
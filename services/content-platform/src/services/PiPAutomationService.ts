import { IScheduleService } from '@/interfaces/IScheduleService';
import { IContentService } from '@/interfaces/IContentService';
import { IPiPAutomationService, PiPTriggerCondition, PiPSession, PiPConfiguration } from '@/interfaces/IPiPAutomationService';
import { Schedule, Content } from '@/models';
import { Logger } from '@/utils/Logger';

/**
 * Picture-in-Picture Automation Service
 * 
 * Intelligent automation that triggers Picture-in-Picture mode based on:
 * - Ad detection in live content streams
 * - Content schedule execution timing
 * - User preferences and context
 * 
 * Single Responsibility: Coordinate PiP automation logic
 * Open/Closed: Extensible for additional trigger conditions
 * Liskov Substitution: Implements standard automation interfaces
 * Interface Segregation: Focused on PiP-specific automation
 * Dependency Inversion: Uses injected services for schedule and content management
 */

export class PiPAutomationService implements IPiPAutomationService {
  private logger: Logger;
  private activeSessions: Map<string, PiPSession>;
  private triggerConditions: PiPTriggerCondition[];
  private config: PiPConfiguration;
  private isRunning: boolean = false;

  constructor(
    private scheduleService: IScheduleService,
    private contentService: IContentService
  ) {
    this.logger = new Logger('PiPAutomationService');
    this.activeSessions = new Map();
    this.triggerConditions = [];
    this.config = this.getDefaultConfiguration();
    this.initializeTriggerConditions();
  }

  /**
   * Start the PiP automation service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('PiP automation service is already running');
      return;
    }

    this.logger.info('Starting PiP automation service');
    this.isRunning = true;

    // Start monitoring for trigger conditions
    this.startMonitoring();
  }

  /**
   * Stop the PiP automation service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping PiP automation service');
    this.isRunning = false;

    // End all active sessions
    await this.endAllActiveSessions();
  }

  /**
   * Trigger Picture-in-Picture mode for specific content
   */
  async triggerPiP(
    contentId: string, 
    reason: string, 
    scheduleId?: string
  ): Promise<PiPSession> {
    if (!this.config.enabled) {
      throw new Error('PiP automation is disabled');
    }

    // Check if we've reached the maximum concurrent sessions
    if (this.activeSessions.size >= this.config.maxConcurrentSessions) {
      // End the oldest session to make room
      await this.endOldestSession();
    }

    // Validate content exists and is available
    const content = await this.contentService.getContent('system', contentId);
    if (!content) {
      throw new Error(`Content not found: ${contentId}`);
    }

    // Check if content is blacklisted
    if (this.config.blacklistedContent.includes(contentId)) {
      this.logger.warn(`Attempted to trigger PiP for blacklisted content: ${contentId}`);
      throw new Error('Content is blacklisted for PiP');
    }

    const sessionId = this.generateSessionId();
    const session: PiPSession = {
      id: sessionId,
      contentId,
      scheduleId,
      startedAt: new Date(),
      triggerReason: reason,
      isActive: true,
      position: { ...this.config.defaultPosition },
    };

    this.activeSessions.set(sessionId, session);
    
    this.logger.info(`PiP session started: ${sessionId} for content: ${contentId}, reason: ${reason}`);

    // Emit event for UI to handle actual PiP display
    await this.notifyPiPTriggered(session);

    return session;
  }

  /**
   * End a specific PiP session
   */
  async endPiPSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      this.logger.warn(`Attempted to end non-existent PiP session: ${sessionId}`);
      return;
    }

    session.isActive = false;
    session.endedAt = new Date();

    this.activeSessions.delete(sessionId);
    
    this.logger.info(`PiP session ended: ${sessionId}`);

    // Emit event for UI to handle PiP removal
    await this.notifyPiPEnded(session);
  }

  /**
   * Update PiP session position
   */
  async updatePiPPosition(
    sessionId: string, 
    position: { x: number; y: number; width: number; height: number }
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`PiP session not found: ${sessionId}`);
    }

    session.position = position;
    
    this.logger.debug(`Updated PiP position for session: ${sessionId}`, position);
  }

  /**
   * Get all active PiP sessions
   */
  getActiveSessions(): PiPSession[] {
    return Array.from(this.activeSessions.values()).filter(s => s.isActive);
  }

  /**
   * Update PiP configuration
   */
  async updateConfiguration(config: Partial<PiPConfiguration>): Promise<void> {
    this.config = { ...this.config, ...config };
    
    this.logger.info('PiP configuration updated', config);

    // If automation was disabled, end all sessions
    if (!this.config.enabled) {
      await this.endAllActiveSessions();
    }
  }

  /**
   * Get current PiP configuration
   */
  getConfiguration(): PiPConfiguration {
    return { ...this.config };
  }

  /**
   * Add a custom trigger condition
   */
  addTriggerCondition(condition: PiPTriggerCondition): void {
    this.triggerConditions.push(condition);
    this.triggerConditions.sort((a, b) => b.priority - a.priority);
    
    this.logger.info(`Added trigger condition: ${condition.name}`);
  }

  /**
   * Remove a trigger condition
   */
  removeTriggerCondition(conditionId: string): void {
    const index = this.triggerConditions.findIndex(c => c.id === conditionId);
    if (index !== -1) {
      const condition = this.triggerConditions.splice(index, 1)[0];
      this.logger.info(`Removed trigger condition: ${condition.name}`);
    }
  }

  /**
   * Initialize default trigger conditions
   */
  private initializeTriggerConditions(): void {
    // Schedule-based trigger
    this.addTriggerCondition({
      id: 'schedule-execution',
      name: 'Schedule Execution',
      description: 'Trigger PiP when a high-priority schedule executes',
      isActive: true,
      priority: 100,
      evaluate: async () => {
        if (!this.config.autoTriggerOnSchedules) return false;

        const activeSchedules = await this.scheduleService.getActiveSchedules();
        return activeSchedules.some(schedule => 
          this.config.priorityContent.includes(schedule.contentId)
        );
      }
    });

    // Content priority trigger
    this.addTriggerCondition({
      id: 'priority-content',
      name: 'Priority Content',
      description: 'Trigger PiP for priority content regardless of schedule',
      isActive: true,
      priority: 90,
      evaluate: async () => {
        // This would typically integrate with content analysis
        // For now, it's a placeholder for priority content detection
        return false;
      }
    });

    // Ad detection trigger (placeholder for integration with ad detection system)
    this.addTriggerCondition({
      id: 'ad-detection',
      name: 'Ad Detection',
      description: 'Trigger PiP when ads are detected in live streams',
      isActive: true,
      priority: 80,
      evaluate: async () => {
        if (!this.config.autoTriggerOnAds) return false;
        
        // This would integrate with the ad detection model
        // For now, it's a placeholder
        return false;
      }
    });
  }

  /**
   * Start monitoring for trigger conditions
   */
  private startMonitoring(): void {
    const monitoringInterval = 5000; // 5 seconds

    const monitor = async () => {
      if (!this.isRunning) return;

      try {
        for (const condition of this.triggerConditions) {
          if (!condition.isActive) continue;

          const shouldTrigger = await condition.evaluate();
          if (shouldTrigger) {
            // Find appropriate content to trigger PiP for
            const content = await this.findTriggerContent(condition);
            if (content) {
              await this.triggerPiP(
                content.id, 
                `Auto-triggered by ${condition.name}`
              );
            }
          }
        }
      } catch (error) {
        this.logger.error('Error during trigger condition monitoring:', error);
      }

      // Schedule next monitoring cycle
      setTimeout(monitor, monitoringInterval);
    };

    // Start monitoring
    setTimeout(monitor, monitoringInterval);
  }

  /**
   * Find content to trigger PiP for based on condition
   */
  private async findTriggerContent(condition: PiPTriggerCondition): Promise<Content | null> {
    try {
      // Get recently executed or scheduled content
      const recentContent = await this.contentService.listContent('system', {
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      });

      // Prefer priority content
      const priorityContent = recentContent.data.find(content => 
        this.config.priorityContent.includes(content.id)
      );

      if (priorityContent) {
        return priorityContent;
      }

      // Fall back to most recent ready content
      return recentContent.data.find(content => 
        content.status === 'ready' && 
        !this.config.blacklistedContent.includes(content.id)
      ) || null;
    } catch (error) {
      this.logger.error('Error finding trigger content:', error);
      return null;
    }
  }

  /**
   * End the oldest active session
   */
  private async endOldestSession(): Promise<void> {
    const sessions = Array.from(this.activeSessions.values())
      .filter(s => s.isActive)
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

    if (sessions.length > 0) {
      await this.endPiPSession(sessions[0].id);
    }
  }

  /**
   * End all active sessions
   */
  private async endAllActiveSessions(): Promise<void> {
    const sessionIds = Array.from(this.activeSessions.keys());
    
    for (const sessionId of sessionIds) {
      await this.endPiPSession(sessionId);
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `pip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get default PiP configuration
   */
  private getDefaultConfiguration(): PiPConfiguration {
    return {
      enabled: true,
      autoTriggerOnAds: true,
      autoTriggerOnSchedules: true,
      defaultPosition: {
        x: window?.innerWidth ? window.innerWidth - 320 - 20 : 300, // 20px from right edge
        y: 20, // 20px from top
        width: 320,
        height: 180
      },
      maxConcurrentSessions: 3,
      priorityContent: [],
      blacklistedContent: []
    };
  }

  /**
   * Notify UI that PiP should be triggered
   * This would typically use WebSockets or Server-Sent Events
   */
  private async notifyPiPTriggered(session: PiPSession): Promise<void> {
    // Placeholder for real-time notification to UI
    this.logger.info(`[UI Event] PiP triggered for session: ${session.id}`);
    
    // In a real implementation, this would emit an event to the frontend
    // Example: this.eventEmitter.emit('pip:triggered', session);
  }

  /**
   * Notify UI that PiP session ended
   */
  private async notifyPiPEnded(session: PiPSession): Promise<void> {
    // Placeholder for real-time notification to UI
    this.logger.info(`[UI Event] PiP ended for session: ${session.id}`);
    
    // In a real implementation, this would emit an event to the frontend
    // Example: this.eventEmitter.emit('pip:ended', session);
  }
}
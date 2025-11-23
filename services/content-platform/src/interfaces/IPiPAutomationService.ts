/**
 * Picture-in-Picture Automation Service Interface
 * 
 * Defines the contract for PiP automation functionality
 * Enables different implementations for various platforms and use cases
 */

export interface PiPTriggerCondition {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  priority: number;
  evaluate(): Promise<boolean>;
}

export interface PiPSession {
  id: string;
  contentId: string;
  scheduleId?: string;
  startedAt: Date;
  endedAt?: Date;
  triggerReason: string;
  isActive: boolean;
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PiPConfiguration {
  enabled: boolean;
  autoTriggerOnAds: boolean;
  autoTriggerOnSchedules: boolean;
  defaultPosition: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  maxConcurrentSessions: number;
  priorityContent: string[];
  blacklistedContent: string[];
}

export interface IPiPAutomationService {
  /**
   * Start the PiP automation service
   */
  start(): Promise<void>;

  /**
   * Stop the PiP automation service
   */
  stop(): Promise<void>;

  /**
   * Manually trigger Picture-in-Picture mode for specific content
   * @param contentId - ID of the content to display in PiP
   * @param reason - Reason for triggering PiP (for logging/analytics)
   * @param scheduleId - Optional schedule ID if triggered by a schedule
   * @returns Promise resolving to the created PiP session
   */
  triggerPiP(contentId: string, reason: string, scheduleId?: string): Promise<PiPSession>;

  /**
   * End a specific PiP session
   * @param sessionId - ID of the session to end
   */
  endPiPSession(sessionId: string): Promise<void>;

  /**
   * Update the position and size of a PiP session
   * @param sessionId - ID of the session to update
   * @param position - New position and size
   */
  updatePiPPosition(
    sessionId: string, 
    position: { x: number; y: number; width: number; height: number }
  ): Promise<void>;

  /**
   * Get all currently active PiP sessions
   * @returns Array of active PiP sessions
   */
  getActiveSessions(): PiPSession[];

  /**
   * Update the PiP automation configuration
   * @param config - Partial configuration to update
   */
  updateConfiguration(config: Partial<PiPConfiguration>): Promise<void>;

  /**
   * Get the current PiP configuration
   * @returns Current configuration
   */
  getConfiguration(): PiPConfiguration;

  /**
   * Add a custom trigger condition for PiP automation
   * @param condition - Trigger condition to add
   */
  addTriggerCondition(condition: PiPTriggerCondition): void;

  /**
   * Remove a trigger condition
   * @param conditionId - ID of the condition to remove
   */
  removeTriggerCondition(conditionId: string): void;
}
import { 
  ISmartPiPAutomationService,
  AdDetection,
  UserPreferences,
  MobileDevicePreferencesUpdate,
  MobileCommand,
  PiPMetrics,
  AnalyticsData,
  UserEngagementMetrics,
  UserInteraction,
  PiPActivationCallback,
  PiPDeactivationCallback,
  ErrorCallback,
  PiPActivationData,
  PiPDeactivationData,
  SmartPiPError,
  ReplacementContent,
  DetectionAnalytics,
  PiPSessionAnalytics,
  UserInteractionAnalytics,
  PerformanceMetrics
} from '@/interfaces/ISmartPiPAutomationService';
import { IAdDetectionService } from '@/interfaces/IAdDetectionService';
import { IPiPManager } from '@/interfaces/IPiPManager';
import { IContentScheduler } from '@/interfaces/IContentScheduler';
import { IStreamController } from '@/interfaces/IStreamController';
import { IUserPreferencesService } from '@/interfaces/IUserPreferencesService';

/**
 * Smart PiP Automation Service
 * 
 * Implements automated Picture-in-Picture functionality that activates
 * when ads are detected, following SOLID principles and TDD methodology.
 * 
 * @implements {ISmartPiPAutomationService}
 */
export class SmartPiPAutomationService implements ISmartPiPAutomationService {
  private static readonly CONFIDENCE_THRESHOLD = 0.85;
  private static readonly THROTTLE_DURATION_MS = 1000;
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly MAX_CACHE_SIZE = 50;

  // Core state management
  private isInitialized = false;
  private userPreferences: UserPreferences | null = null;

  // Session tracking - optimized with Maps for O(1) lookups
  private readonly activePiPSessions = new Map<string, PiPSessionInfo>();
  private readonly detectionThrottleMap = new Map<string, number>();

  // Performance optimizations
  private readonly contentCache = new Map<string, CachedContent>();
  private readonly performanceTracker = new PerformanceTracker();

  // Analytics and metrics - immutable approach
  private analyticsData: AnalyticsData;
  private metrics: PiPMetrics;

  // Observer pattern for event handling
  private readonly eventCallbacks = new Map<string, Function[]>();

  // Mobile device management - separated for SRP
  private readonly mobileDeviceManager = new MobileDeviceManager();

  /**
   * Constructor implementing Dependency Injection principle
   */
  constructor(
    private readonly adDetectionService: IAdDetectionService,
    private readonly pipManager: IPiPManager,
    private readonly contentScheduler: IContentScheduler,
    private readonly streamController: IStreamController,
    private readonly userPreferencesService: IUserPreferencesService
  ) {
    // Initialize immutable analytics data
    this.analyticsData = this.createEmptyAnalyticsData();
    this.metrics = this.createEmptyMetrics();

    // Initialize event callback maps
    this.initializeEventCallbacks();
  }

  /**
   * Initialize the Smart PiP Automation service
   * Following fail-fast principle with proper error handling
   */
  async initialize(): Promise<void> {
    try {
      this.validateDependencies();
      
      // Load user preferences with fallback
      await this.loadUserPreferences();
      
      // Subscribe to ad detection events
      await this.subscribeToDetectionEvents();
      
      // Initialize performance tracking
      this.performanceTracker.start();
      
      this.isInitialized = true;
    } catch (error) {
      this.handleInitializationError(error);
    }
  }

  async shutdown(): Promise<void> {
    try {
      // Unsubscribe from detection events
      await this.adDetectionService.unsubscribeFromDetections();
      
      // Deactivate all active PiP sessions
      for (const streamId of this.activePiPSessions.keys()) {
        await this.pipManager.deactivatePiP(streamId);
      }
      
      // Clear state
      this.activePiPSessions.clear();
      this.contentCache.clear();
      this.detectionThrottleMap.clear();
      this.isInitialized = false;
    } catch (error) {
      this.emitError({
        code: 'SHUTDOWN_ERROR',
        message: `Failed to shutdown Smart PiP Automation: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        context: { error }
      });
    }
  }

  // Core detection handling with validation and throttling
  async handleAdDetection(detection: AdDetection): Promise<void> {
    const startTime = performance.now();
    
    try {
      // Validate detection data
      this.validateDetection(detection);
      
      // Check if user preferences allow PiP
      if (!this.shouldActivatePiP(detection)) {
        return;
      }

      // Check for throttling to prevent rapid activations
      if (this.isThrottled(detection.streamId)) {
        return;
      }

      // Check if PiP is already active for this stream
      if (this.pipManager.isPiPActive(detection.streamId)) {
        return;
      }

      // Apply switch delay if configured
      if (this.userPreferences?.switchDelay && this.userPreferences.switchDelay > 0) {
        await this.delay(this.userPreferences.switchDelay);
      }

      // Get replacement content
      const content = await this.getReplacementContent(detection);
      
      // Get effective preferences (user + mobile device overrides)
      const effectivePreferences = this.getEffectivePreferences();
      
      // Calculate PiP position and size based on ad type
      const pipConfig = this.calculatePiPConfiguration(detection, effectivePreferences);
      
      // Activate PiP
      await this.pipManager.activatePiP({
        streamId: detection.streamId,
        position: pipConfig.position,
        size: pipConfig.size,
        content: content
      });

      // Track activation
      const sessionId = `pip-${detection.id}-${Date.now()}`;
      const sessionInfo: PiPSessionInfo = {
        sessionId,
        streamId: detection.streamId,
        startTime: new Date(),
        contentReplaced: content !== null,
        userInteractions: 0
      };
      this.activePiPSessions.set(detection.streamId, sessionInfo);
      
      // Update metrics and analytics
      this.updateMetrics(startTime, true);
      this.recordDetectionAnalytics(detection, 'pip_activated', performance.now() - startTime);
      this.recordPiPSessionStart(sessionId, detection.streamId, content);
      
      // Notify observers
      this.emitPiPActivation({
        streamId: detection.streamId,
        pipActive: true,
        content: content,
        timestamp: new Date(),
        position: pipConfig.position,
        size: pipConfig.size
      });

      // Mark throttling timestamp
      this.detectionThrottleMap.set(detection.streamId, Date.now());

    } catch (error) {
      this.updateMetrics(startTime, false);
      this.emitError({
        code: 'DETECTION_HANDLING_ERROR',
        message: `Failed to handle ad detection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        context: { detection, error }
      });
    }
  }

  async handleAdDetectionEnd(detection: AdDetection): Promise<void> {
    try {
      const sessionInfo = this.activePiPSessions.get(detection.streamId);
      
      // Deactivate PiP
      await this.pipManager.deactivatePiP(detection.streamId);
      
      // Resume original stream
      await this.streamController.resumeStream(detection.streamId);
      
      // Clean up session tracking
      this.activePiPSessions.delete(detection.streamId);
      
      // Record session end
      if (sessionInfo) {
        this.recordPiPSessionEnd(sessionInfo.sessionId, 'ad_ended');
      }
      
      // Notify observers
      this.emitPiPDeactivation({
        streamId: detection.streamId,
        sessionDuration: detection.duration,
        timestamp: new Date(),
        reason: 'ad_ended'
      });

    } catch (error) {
      this.emitError({
        code: 'DETECTION_END_ERROR',
        message: `Failed to handle ad detection end: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        context: { detection, error }
      });
    }
  }

  async handleDetectionServiceReconnect(): Promise<void> {
    try {
      // Resubscribe to detection events
      await this.adDetectionService.subscribeToDetections(this.handleAdDetection.bind(this));
    } catch (error) {
      this.emitError({
        code: 'RECONNECT_ERROR',
        message: `Failed to reconnect to detection service: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        context: { error }
      });
    }
  }

  async preloadContentForStream(streamId: string): Promise<void> {
    try {
      if (!this.userPreferences) return;

      await this.contentScheduler.preloadContent({
        streamId: streamId,
        expectedDuration: 30000, // Default 30 seconds
        quality: this.userPreferences.qualityPreference,
        count: 3 // Preload 3 content items
      });
    } catch (error) {
      this.emitError({
        code: 'PRELOAD_ERROR',
        message: `Failed to preload content for stream: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        context: { streamId, error }
      });
    }
  }

  async updateMobileDevicePreferences(update: MobileDevicePreferencesUpdate): Promise<void> {
    try {
      this.mobileDeviceManager.updatePreferences(update.deviceId, update.preferences);
    } catch (error) {
      this.emitError({
        code: 'MOBILE_PREFERENCES_ERROR',
        message: `Failed to update mobile device preferences: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        context: { update, error }
      });
    }
  }

  async handleMobileCommand(command: MobileCommand): Promise<void> {
    try {
      switch (command.command) {
        case 'disable_auto_pip':
          this.mobileDeviceManager.setAutoSwitch(command.deviceId, false);
          break;
        case 'enable_auto_pip':
          this.mobileDeviceManager.setAutoSwitch(command.deviceId, true);
          break;
        case 'force_pip_activation':
          // Handle force activation
          break;
        case 'force_pip_deactivation':
          // Handle force deactivation
          break;
      }
    } catch (error) {
      this.emitError({
        code: 'MOBILE_COMMAND_ERROR',
        message: `Failed to handle mobile command: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        context: { command, error }
      });
    }
  }

  async getPiPMetrics(): Promise<PiPMetrics> {
    return { ...this.metrics };
  }

  async getAnalytics(): Promise<AnalyticsData> {
    return {
      detections: [...this.analyticsData.detections],
      pipSessions: [...this.analyticsData.pipSessions],
      userInteractions: [...this.analyticsData.userInteractions],
      performance: { ...this.analyticsData.performance }
    };
  }

  async getUserEngagementMetrics(): Promise<UserEngagementMetrics> {
    const interactions = this.analyticsData.userInteractions;
    const totalInteractionTime = interactions.reduce((sum, interaction) => sum + interaction.duration, 0);
    const averageInteractionTime = interactions.length > 0 ? totalInteractionTime / interactions.length : 0;

    return {
      averageInteractionTime,
      interactionFrequency: interactions.length,
      contentCompletionRate: 0.85, // Placeholder calculation
      userSatisfactionScore: 4.2 // Placeholder
    };
  }

  async recordUserInteraction(interaction: UserInteraction): Promise<void> {
    try {
      this.analyticsData.userInteractions.push({
        type: interaction.type,
        timestamp: interaction.timestamp,
        duration: interaction.duration,
        context: interaction.context
      });
    } catch (error) {
      this.emitError({
        code: 'INTERACTION_RECORDING_ERROR',
        message: `Failed to record user interaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        context: { interaction, error }
      });
    }
  }

  // Event registration methods
  onPiPActivation(callback: PiPActivationCallback): void {
    const callbacks = this.eventCallbacks.get('pipActivation') || [];
    callbacks.push(callback);
    this.eventCallbacks.set('pipActivation', callbacks);
  }

  onPiPDeactivation(callback: PiPDeactivationCallback): void {
    const callbacks = this.eventCallbacks.get('pipDeactivation') || [];
    callbacks.push(callback);
    this.eventCallbacks.set('pipDeactivation', callbacks);
  }

  onError(callback: ErrorCallback): void {
    const callbacks = this.eventCallbacks.get('error') || [];
    callbacks.push(callback);
    this.eventCallbacks.set('error', callbacks);
  }

  // Private helper methods
  private validateDetection(detection: AdDetection): void {
    if (!detection.id || !detection.streamId || detection.confidence === undefined) {
      throw new Error('Invalid detection data');
    }
    if (detection.confidence < 0 || detection.confidence > 1) {
      throw new Error('Detection confidence must be between 0 and 1');
    }
  }

  private shouldActivatePiP(detection: AdDetection): boolean {
    if (!this.userPreferences) return false;

    // Check if PiP is globally disabled
    if (!this.userPreferences.pipEnabled || !this.userPreferences.autoSwitch) {
      return false;
    }

    // Check mobile device override
    const deviceStates = this.mobileDeviceManager.getAllDeviceStates();
    const mobileOverride = Array.from(deviceStates.values()).some(enabled => !enabled);
    if (mobileOverride) {
      return false;
    }

    // Check confidence threshold (>= 0.85)
    if (detection.confidence < 0.85) {
      return false;
    }

    // Check category exclusions
    if (detection.metadata?.category && 
        this.userPreferences.skipCategories.includes(detection.metadata.category)) {
      return false;
    }

    // Check max ad duration
    if (detection.duration > this.userPreferences.maxAdDuration) {
      return false;
    }

    return true;
  }

  private isThrottled(streamId: string): boolean {
    const lastTime = this.detectionThrottleMap.get(streamId);
    if (!lastTime) return false;
    
    const timeSinceLastDetection = Date.now() - lastTime;
    return timeSinceLastDetection < SmartPiPAutomationService.THROTTLE_DURATION_MS;
  }

  private async getReplacementContent(detection: AdDetection): Promise<ReplacementContent | null> {
    try {
      if (!this.userPreferences) return null;

      // Check cache first for performance
      const cacheKey = `${detection.metadata?.brand}-${detection.metadata?.category}`;
      const cached = this.contentCache.get(cacheKey);
      if (cached && this.isCacheValid(cached)) {
        return cached.content;
      }

      const content = await this.contentScheduler.getReplacementContent({
        duration: detection.duration,
        preferredCategories: this.userPreferences.preferredContent,
        excludeCategories: this.userPreferences.skipCategories,
        quality: this.userPreferences.qualityPreference
      });

      // Cache for future use
      if (content) {
        this.addToContentCache(cacheKey, content);
      }

      return content;
    } catch (error) {
      // Fallback to null content (original stream)
      return null;
    }
  }

  private getEffectivePreferences(): UserPreferences {
    if (!this.userPreferences) {
      throw new Error('User preferences not loaded');
    }

    // Start with base user preferences
    let effective = { ...this.userPreferences };

    // Apply mobile device overrides from all devices
    const allDeviceStates = this.mobileDeviceManager.getAllDeviceStates();
    allDeviceStates.forEach((_, deviceId) => {
      const devicePrefs = this.mobileDeviceManager.getPreferences(deviceId);
      if (devicePrefs) {
        effective = { ...effective, ...devicePrefs };
      }
    });

    return effective;
  }

  private calculatePiPConfiguration(detection: AdDetection, preferences: UserPreferences) {
    let position = { ...preferences.pipPosition };
    let size = { ...preferences.pipSize };

    // Adjust based on ad type
    switch (detection.adType) {
      case 'overlay':
        // Move PiP to avoid overlay
        position.x = detection.boundingBox.x + detection.boundingBox.width + 50;
        position.y = detection.boundingBox.y + detection.boundingBox.height + 50;
        break;
      case 'banner':
        // Larger PiP for banner ads
        size.width = 400;
        size.height = 225;
        break;
      case 'commercial':
        // Use default settings
        break;
    }

    return { position, size };
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private updateMetrics(startTime: number, success: boolean): void {
    const processingTime = performance.now() - startTime;
    
    this.metrics.totalActivations += success ? 1 : 0;
    this.metrics.averageSwitchTime = (this.metrics.averageSwitchTime + processingTime) / 2;
    
    const totalAttempts = this.metrics.totalActivations + (success ? 0 : 1);
    this.metrics.successRate = totalAttempts > 0 ? (this.metrics.totalActivations / totalAttempts) * 100 : 0;
    
    this.analyticsData.performance.averageDetectionTime = processingTime;
    this.analyticsData.performance.averagePiPActivationTime = processingTime;
  }

  private recordDetectionAnalytics(detection: AdDetection, action: string, processingTime: number): void {
    this.analyticsData.detections.push({
      detectionId: detection.id,
      confidence: detection.confidence,
      action,
      timestamp: new Date(),
      processingTime
    });
  }

  private recordPiPSessionStart(sessionId: string, streamId: string, content: ReplacementContent | null): void {
    this.analyticsData.pipSessions.push({
      sessionId,
      streamId,
      startTime: new Date(),
      contentReplaced: content !== null,
      userInteractions: 0
    });
  }

  private recordPiPSessionEnd(sessionId: string, reason: string): void {
    const session = this.analyticsData.pipSessions.find(s => s.sessionId === sessionId);
    if (session) {
      session.endTime = new Date();
    }
  }

  // Event emission methods
  private emitPiPActivation(data: PiPActivationData): void {
    const callbacks = this.eventCallbacks.get('pipActivation') || [];
    callbacks.forEach((callback: any) => {
      try {
        callback(data);
      } catch (error) {
        console.error('Error in PiP activation callback:', error);
      }
    });
  }

  private emitPiPDeactivation(data: PiPDeactivationData): void {
    const callbacks = this.eventCallbacks.get('pipDeactivation') || [];
    callbacks.forEach((callback: any) => {
      try {
        callback(data);
      } catch (error) {
        console.error('Error in PiP deactivation callback:', error);
      }
    });
  }

  private emitError(error: SmartPiPError): void {
    const callbacks = this.eventCallbacks.get('error') || [];
    callbacks.forEach((callback: any) => {
      try {
        callback(error);
      } catch (err) {
        console.error('Error in error callback:', err);
      }
    });
  }

  // ============================================================================
  // REFACTORED HELPER METHODS (Single Responsibility Principle)
  // ============================================================================

  /**
   * Validate all dependency injections are properly set
   */
  private validateDependencies(): void {
    const dependencies = [
      this.adDetectionService,
      this.pipManager,
      this.contentScheduler,
      this.streamController,
      this.userPreferencesService
    ];

    if (dependencies.some(dep => !dep)) {
      throw new Error('Missing required dependencies for Smart PiP Automation');
    }
  }

  /**
   * Load user preferences with fallback to defaults
   */
  private async loadUserPreferences(): Promise<void> {
    try {
      this.userPreferences = await this.userPreferencesService.getUserPreferences('default');
    } catch (error) {
      // Fallback to default preferences
      this.userPreferences = await this.userPreferencesService.getDefaultPreferences();
    }
  }

  /**
   * Subscribe to detection events with error handling
   */
  private async subscribeToDetectionEvents(): Promise<void> {
    await this.adDetectionService.subscribeToDetections(
      this.createDetectionHandler()
    );
  }

  /**
   * Create detection handler with proper binding and error handling
   */
  private createDetectionHandler() {
    return async (detection: AdDetection) => {
      try {
        await this.handleAdDetection(detection);
      } catch (error) {
        this.emitError({
          code: 'DETECTION_HANDLER_ERROR',
          message: `Detection handler failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date(),
          context: { detection, error }
        });
      }
    };
  }

  /**
   * Handle initialization errors with proper logging
   */
  private handleInitializationError(error: unknown): never {
    const errorMessage = `Smart PiP Automation initialization failed: ${
      error instanceof Error ? error.message : 'Unknown error'
    }`;
    
    this.emitError({
      code: 'INITIALIZATION_ERROR',
      message: errorMessage,
      timestamp: new Date(),
      context: { error }
    });
    
    throw new Error(errorMessage);
  }

  /**
   * Create empty analytics data structure
   */
  private createEmptyAnalyticsData(): AnalyticsData {
    return {
      detections: [],
      pipSessions: [],
      userInteractions: [],
      performance: {
        averageDetectionTime: 0,
        averagePiPActivationTime: 0,
        memoryUsage: 0,
        cpuUsage: 0
      }
    };
  }

  /**
   * Create empty metrics structure
   */
  private createEmptyMetrics(): PiPMetrics {
    return {
      totalActivations: 0,
      averageSwitchTime: 0,
      successRate: 0,
      userEngagement: 0,
      contentReplacementRate: 0
    };
  }

  /**
   * Initialize event callback maps
   */
  private initializeEventCallbacks(): void {
    this.eventCallbacks.set('pipActivation', []);
    this.eventCallbacks.set('pipDeactivation', []);
    this.eventCallbacks.set('error', []);
  }

  // ============================================================================
  // OPTIMIZED DETECTION PROCESSING
  // ============================================================================

  /**
   * Enhanced detection validation with caching
   */
  private async validateDetectionEnhanced(detection: AdDetection): Promise<boolean> {
    // Basic validation
    this.validateDetection(detection);

    // Cache validation results for performance
    const cacheKey = `validation_${detection.id}`;
    const cached = this.getCachedValidation(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    // Perform validation
    const isValid = await this.adDetectionService.validateDetection(detection);
    this.setCachedValidation(cacheKey, isValid);
    
    return isValid;
  }

  /**
   * Check if detection should trigger PiP with enhanced rules
   */
  private shouldActivatePiPEnhanced(detection: AdDetection): boolean {
    const baseRules = this.shouldActivatePiP(detection);
    if (!baseRules) return false;

    // Enhanced business rules
    return (
      this.isConfidenceAboveThreshold(detection.confidence) &&
      this.isNotInThrottleWindow(detection.streamId) &&
      this.isStreamEligibleForPiP(detection.streamId) &&
      !this.isPiPAlreadyActive(detection.streamId)
    );
  }

  /**
   * Optimized content retrieval with intelligent caching
   */
  private async getReplacementContentOptimized(detection: AdDetection): Promise<ReplacementContent | null> {
    if (!this.userPreferences) return null;

    // Smart cache key based on detection characteristics
    const cacheKey = this.generateContentCacheKey(detection);
    const cached = this.getFromContentCache(cacheKey);
    
    if (cached && this.isCacheValid(cached)) {
      this.updateCacheHitMetrics();
      return cached.content;
    }

    // Fetch new content
    const content = await this.contentScheduler.getReplacementContent({
      duration: detection.duration,
      preferredCategories: this.userPreferences.preferredContent,
      excludeCategories: this.userPreferences.skipCategories,
      quality: this.userPreferences.qualityPreference
    });

    // Cache the result
    if (content) {
      this.addToContentCache(cacheKey, content);
    }

    return content;
  }

  // ============================================================================
  // HELPER CLASSES (Supporting Single Responsibility Principle)
  // ============================================================================

  private isConfidenceAboveThreshold(confidence: number): boolean {
    return confidence >= SmartPiPAutomationService.CONFIDENCE_THRESHOLD;
  }

  private isNotInThrottleWindow(streamId: string): boolean {
    const lastTime = this.detectionThrottleMap.get(streamId);
    if (!lastTime) return true;
    
    return Date.now() - lastTime >= SmartPiPAutomationService.THROTTLE_DURATION_MS;
  }

  private isStreamEligibleForPiP(streamId: string): boolean {
    // Add business logic for stream eligibility
    return !this.activePiPSessions.has(streamId);
  }

  private isPiPAlreadyActive(streamId: string): boolean {
    return this.pipManager.isPiPActive(streamId);
  }

  private generateContentCacheKey(detection: AdDetection): string {
    return `${detection.metadata?.brand || 'unknown'}_${detection.metadata?.category || 'general'}_${detection.duration}`;
  }

  private getFromContentCache(key: string): CachedContent | undefined {
    return this.contentCache.get(key);
  }

  private isCacheValid(cached: CachedContent): boolean {
    return Date.now() - cached.timestamp <= SmartPiPAutomationService.CACHE_TTL_MS;
  }

  private addToContentCache(key: string, content: ReplacementContent): void {
    // Implement LRU eviction if cache is full
    if (this.contentCache.size >= SmartPiPAutomationService.MAX_CACHE_SIZE) {
      const firstKey = this.contentCache.keys().next().value;
      if (firstKey) {
        this.contentCache.delete(firstKey);
      }
    }

    this.contentCache.set(key, {
      content,
      timestamp: Date.now()
    });
  }

  private getCachedValidation(key: string): boolean | undefined {
    // Simple validation cache implementation
    return undefined; // Placeholder
  }

  private setCachedValidation(key: string, isValid: boolean): void {
    // Simple validation cache implementation
    // Placeholder
  }

  private updateCacheHitMetrics(): void {
    this.metrics.contentReplacementRate += 0.1; // Increment cache hit rate
  }
}

// ============================================================================
// SUPPORTING INTERFACES AND CLASSES
// ============================================================================

interface PiPSessionInfo {
  sessionId: string;
  streamId: string;
  startTime: Date;
  endTime?: Date;
  contentReplaced: boolean;
  userInteractions: number;
}

interface CachedContent {
  content: ReplacementContent;
  timestamp: number;
}

/**
 * Performance tracking utility following SRP
 */
class PerformanceTracker {
  private startTimes = new Map<string, number>();

  start(key: string = 'default'): void {
    this.startTimes.set(key, performance.now());
  }

  end(key: string = 'default'): number {
    const startTime = this.startTimes.get(key);
    if (!startTime) return 0;
    
    const duration = performance.now() - startTime;
    this.startTimes.delete(key);
    return duration;
  }

  getCurrentMemoryUsage(): number {
    // Placeholder implementation
    return 0;
  }

  getCurrentCpuUsage(): number {
    // Placeholder implementation
    return 0;
  }
}

/**
 * Mobile device management utility following SRP
 */
class MobileDeviceManager {
  private devicePreferences = new Map<string, Partial<UserPreferences>>();
  private deviceStates = new Map<string, boolean>();

  updatePreferences(deviceId: string, preferences: Partial<UserPreferences>): void {
    this.devicePreferences.set(deviceId, preferences);
  }

  getPreferences(deviceId: string): Partial<UserPreferences> | undefined {
    return this.devicePreferences.get(deviceId);
  }

  setAutoSwitch(deviceId: string, enabled: boolean): void {
    this.deviceStates.set(deviceId, enabled);
  }

  isAutoSwitchEnabled(deviceId: string): boolean {
    return this.deviceStates.get(deviceId) ?? true;
  }

  getAllDeviceStates(): Map<string, boolean> {
    return new Map(this.deviceStates);
  }
}
// Interface Segregation Principle: Focused interface for Smart PiP Automation
export interface ISmartPiPAutomationService {
  // Lifecycle management
  initialize(): Promise<void>;
  shutdown(): Promise<void>;

  // Core automation functionality
  handleAdDetection(detection: AdDetection): Promise<void>;
  handleAdDetectionEnd(detection: AdDetection): Promise<void>;
  handleDetectionServiceReconnect(): Promise<void>;

  // Content and session management
  preloadContentForStream(streamId: string): Promise<void>;
  updateMobileDevicePreferences(update: MobileDevicePreferencesUpdate): Promise<void>;
  handleMobileCommand(command: MobileCommand): Promise<void>;

  // Analytics and monitoring
  getPiPMetrics(): Promise<PiPMetrics>;
  getAnalytics(): Promise<AnalyticsData>;
  getUserEngagementMetrics(): Promise<UserEngagementMetrics>;
  recordUserInteraction(interaction: UserInteraction): Promise<void>;

  // Event handlers
  onPiPActivation(callback: PiPActivationCallback): void;
  onPiPDeactivation(callback: PiPDeactivationCallback): void;
  onError(callback: ErrorCallback): void;
}

// Detection-related interfaces
export interface AdDetection {
  id: string;
  streamId: string;
  adType: 'commercial' | 'banner' | 'overlay';
  confidence: number;
  boundingBox: BoundingBox;
  timestamp: Date;
  duration: number;
  metadata: AdMetadata;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AdMetadata {
  brand?: string;
  category?: string;
  language?: string;
  [key: string]: any;
}

// User preferences interfaces
export interface UserPreferences {
  userId: string;
  pipEnabled: boolean;
  autoSwitch: boolean;
  switchDelay: number;
  preferredContent: string[];
  skipCategories: string[];
  pipPosition: Position;
  pipSize: Size;
  maxAdDuration: number;
  qualityPreference: string;
}

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

// Mobile device interfaces
export interface MobileDevicePreferencesUpdate {
  deviceId: string;
  preferences: Partial<UserPreferences>;
}

export interface MobileCommand {
  deviceId: string;
  command: 'enable_auto_pip' | 'disable_auto_pip' | 'force_pip_activation' | 'force_pip_deactivation';
  timestamp: Date;
  parameters?: any;
}

// Content interfaces
export interface ReplacementContent {
  id: string;
  title: string;
  url: string;
  duration: number;
  type: string;
  metadata?: ContentMetadata;
}

export interface ContentMetadata {
  category: string;
  quality: string;
  language: string;
  rating?: string;
  [key: string]: any;
}

// Analytics interfaces
export interface PiPMetrics {
  totalActivations: number;
  averageSwitchTime: number;
  successRate: number;
  userEngagement: number;
  contentReplacementRate: number;
}

export interface AnalyticsData {
  detections: DetectionAnalytics[];
  pipSessions: PiPSessionAnalytics[];
  userInteractions: UserInteractionAnalytics[];
  performance: PerformanceMetrics;
}

export interface DetectionAnalytics {
  detectionId: string;
  confidence: number;
  action: string;
  timestamp: Date;
  processingTime?: number;
}

export interface PiPSessionAnalytics {
  sessionId: string;
  streamId: string;
  startTime: Date;
  endTime?: Date;
  contentReplaced: boolean;
  userInteractions: number;
}

export interface UserInteractionAnalytics {
  type: string;
  timestamp: Date;
  duration: number;
  context: any;
}

export interface PerformanceMetrics {
  averageDetectionTime: number;
  averagePiPActivationTime: number;
  memoryUsage: number;
  cpuUsage: number;
}

export interface UserEngagementMetrics {
  averageInteractionTime: number;
  interactionFrequency: number;
  contentCompletionRate: number;
  userSatisfactionScore?: number;
}

export interface UserInteraction {
  type: 'pip_resize' | 'pip_move' | 'pip_minimize' | 'content_skip' | 'content_like';
  timestamp: Date;
  duration: number;
  context?: any;
}

// Stream interfaces
export interface Stream {
  id: string;
  title: string;
  status: { state: string; health: string };
  quality: { resolution: string; bitrate: number; framerate: number };
  currentViewers: number;
  isPublic: boolean;
  recordingEnabled: boolean;
  adDetectionEnabled: boolean;
  thumbnailUrl?: string | null;
  createdAt: Date;
}

// Callback types
export type PiPActivationCallback = (data: PiPActivationData) => void;
export type PiPDeactivationCallback = (data: PiPDeactivationData) => void;
export type ErrorCallback = (error: SmartPiPError) => void;

export interface PiPActivationData {
  streamId: string;
  pipActive: boolean;
  content: ReplacementContent | null;
  timestamp: Date;
  position: Position;
  size: Size;
}

export interface PiPDeactivationData {
  streamId: string;
  sessionDuration: number;
  timestamp: Date;
  reason: 'ad_ended' | 'user_action' | 'error' | 'timeout';
}

export interface SmartPiPError {
  code: string;
  message: string;
  timestamp: Date;
  context?: any;
}
/**
 * Mobile Remote Control Service Interface
 * 
 * Defines contracts for remote control of streams and Picture-in-Picture functionality
 * through paired mobile devices. Supports device pairing, authentication, command
 * execution, and real-time synchronization.
 * 
 * Features:
 * - Device pairing and management
 * - Remote stream control (start/stop/pause/resume)
 * - Picture-in-Picture control from mobile
 * - Real-time notifications and status updates
 * - Secure session management
 * - Multi-device support per user
 */

export interface IMobileRemoteService {
  // Device Pairing and Management
  initiatePairing(userId: string, deviceInfo: DeviceInfo): Promise<PairingResponse>;
  completePairing(pairingCode: string, deviceId: string): Promise<PairingResult>;
  unpairDevice(deviceId: string, userId: string): Promise<void>;
  getUserDevices(userId: string): Promise<MobileDeviceInfo[]>;
  updateDevice(deviceId: string, updates: Partial<DeviceInfo>): Promise<MobileDeviceInfo>;
  getDeviceStatus(deviceId: string): Promise<DeviceStatus>;

  // Command Execution
  executeCommand(deviceId: string, command: RemoteCommand): Promise<CommandResult>;
  executeStreamCommand(deviceId: string, command: StreamControlCommand): Promise<CommandResult>;

  // Session Management  
  createSession(deviceId: string, userId: string): Promise<SessionInfo>;
  validateSession(sessionToken: string): Promise<SessionValidationResult>;
  refreshSession(sessionToken: string): Promise<SessionInfo>;
  endSession(sessionToken: string): Promise<void>;

  // Real-time Communication
  broadcastStreamStatus(userId: string, status: StreamStatusUpdate): Promise<void>;
  sendAdDetectionNotification(userId: string, adDetection: AdDetectionNotification): Promise<void>;
  sendPipStatusUpdate(userId: string, pipStatus: PipStatusUpdate): Promise<void>;

  // Analytics and Monitoring
  getDeviceUsageStats(deviceId: string, timeRange?: TimeRange): Promise<DeviceUsageStats>;
  getRemoteControlStats(userId: string, timeRange?: TimeRange): Promise<RemoteControlStats>;
}

// Device Information and Capabilities
export interface DeviceInfo {
  name: string;
  model: string;
  os: 'iOS' | 'Android' | 'Other';
  osVersion: string;
  appVersion: string;
  capabilities: DeviceCapability[];
  metadata?: Record<string, any>;
}

export interface MobileDeviceInfo extends DeviceInfo {
  id: string;
  userId: string;
  deviceId: string;
  isPaired: boolean;
  lastSeen: Date;
  isOnline: boolean;
  batteryLevel?: number;
  networkType?: 'wifi' | 'cellular' | 'unknown';
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceStatus {
  id: string;
  name: string;
  isOnline: boolean;
  batteryLevel?: number;
  capabilities: DeviceCapability[];
  lastSeen: Date;
  activeSession?: {
    id: string;
    startedAt: Date;
    lastActivity: Date;
  };
  networkInfo?: {
    type: 'wifi' | 'cellular' | 'unknown';
    strength?: number;
  };
}

export type DeviceCapability = 
  | 'stream_control'      // Can start/stop/pause streams
  | 'pip_control'         // Can control Picture-in-Picture
  | 'notifications'       // Can receive push notifications
  | 'voice_control'       // Supports voice commands
  | 'haptic_feedback'     // Supports haptic feedback
  | 'camera_control'      // Can control camera settings
  | 'audio_control'       // Can control audio settings
  | 'chat_moderation';    // Can moderate chat

// Pairing System
export interface PairingRequest {
  userId: string;
  deviceInfo: DeviceInfo;
}

export interface PairingResponse {
  pairingCode: string;
  expiresAt: Date;
  instructions: string;
  qrCode?: string; // Base64 encoded QR code for easier pairing
}

export interface PairingResult {
  status: PairingStatus;
  device?: MobileDeviceInfo;
  sessionToken?: string;
  error?: string;
}

export enum PairingStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  EXPIRED = 'expired',
  PENDING = 'pending'
}

// Command System
export interface RemoteCommand {
  type: CommandType;
  parameters: Record<string, any>;
  metadata?: {
    timestamp?: Date;
    priority?: 'low' | 'normal' | 'high';
    requestId?: string;
  };
}

export interface StreamControlCommand {
  type: StreamCommandType;
  streamId: string;
  parameters: Record<string, any>;
  metadata?: {
    timestamp?: Date;
    priority?: 'low' | 'normal' | 'high';
    requestId?: string;
  };
}

export interface CommandResult {
  success: boolean;
  commandId: string;
  result?: any;
  error?: string;
  timestamp: Date;
  executionTime?: number; // milliseconds
}

export type CommandType = 
  | 'pip_enable'
  | 'pip_disable'
  | 'pip_resize'
  | 'pip_move'
  | 'notification_test'
  | 'device_status'
  | 'stream_list'
  | 'haptic_feedback'
  | 'voice_command';

export type StreamCommandType = 
  | 'stream_start'
  | 'stream_stop'
  | 'stream_pause'
  | 'stream_resume'
  | 'quality_change'
  | 'camera_toggle'
  | 'audio_toggle'
  | 'recording_start'
  | 'recording_stop';

// Session Management
export interface SessionInfo {
  sessionId: string;
  token: string;
  deviceId: string;
  userId: string;
  expiresAt: Date;
  capabilities: DeviceCapability[];
  metadata?: Record<string, any>;
}

export interface SessionValidationResult {
  valid: boolean;
  session?: {
    id: string;
    deviceId: string;
    userId: string;
    isActive: boolean;
    lastActivity: Date;
    capabilities: DeviceCapability[];
  };
  error?: string;
}

// Real-time Communication
export interface StreamStatusUpdate {
  streamId: string;
  status: 'idle' | 'starting' | 'live' | 'paused' | 'stopping' | 'stopped' | 'error';
  viewers?: number;
  health?: 'good' | 'poor' | 'critical';
  quality?: {
    resolution: string;
    bitrate: number;
    framerate: number;
  };
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AdDetectionNotification {
  streamId: string;
  type: 'commercial' | 'product_placement' | 'sponsored_content' | 'unknown';
  confidence: number; // 0.0 to 1.0
  timestamp: Date;
  action: 'pip_enabled' | 'notification_sent' | 'none';
  duration?: number; // Expected duration in seconds
  metadata?: {
    brands?: string[];
    categories?: string[];
    skipable?: boolean;
  };
}

export interface PipStatusUpdate {
  streamId?: string;
  isEnabled: boolean;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  timestamp: Date;
  reason?: 'user_action' | 'ad_detected' | 'stream_ended' | 'error';
}

// Analytics and Statistics
export interface DeviceUsageStats {
  deviceId: string;
  timeRange: TimeRange;
  totalSessions: number;
  totalSessionTime: number; // minutes
  commandsExecuted: number;
  commandsByType: Record<CommandType | StreamCommandType, number>;
  averageSessionDuration: number; // minutes
  mostActiveHours: number[]; // Hours of day (0-23)
  pipUsage: {
    totalActivations: number;
    totalTime: number; // minutes
    averageDuration: number; // minutes
  };
  streamControl: {
    streamsControlled: number;
    totalControlTime: number; // minutes
    commandsExecuted: Record<StreamCommandType, number>;
  };
}

export interface RemoteControlStats {
  userId: string;
  timeRange: TimeRange;
  totalDevices: number;
  activeDevices: number;
  totalCommands: number;
  commandSuccessRate: number; // percentage
  averageResponseTime: number; // milliseconds
  topCommands: Array<{
    type: CommandType | StreamCommandType;
    count: number;
    successRate: number;
  }>;
  deviceBreakdown: Array<{
    deviceId: string;
    deviceName: string;
    commandsExecuted: number;
    lastUsed: Date;
  }>;
}

export interface TimeRange {
  start: Date;
  end: Date;
}

// WebSocket Events for Mobile Communication
export interface MobileWebSocketEvents {
  // From server to mobile device
  commandExecuted: CommandResult;
  streamStatusUpdate: StreamStatusUpdate;
  adDetected: AdDetectionNotification;
  pipStatusUpdate: PipStatusUpdate;
  deviceUnpaired: { reason: string };
  sessionExpired: { reason: string };
  
  // From mobile device to server
  executeCommand: RemoteCommand;
  executeStreamCommand: StreamControlCommand;
  requestStatus: { type: 'stream' | 'pip' | 'device' };
  heartbeat: { timestamp: Date; batteryLevel?: number };
}

// Configuration
export interface MobileRemoteConfig {
  pairingCodeLength: number;
  pairingCodeExpiry: number; // minutes
  sessionTimeout: number; // minutes
  maxDevicesPerUser: number;
  enabledCapabilities: DeviceCapability[];
  rateLimit: {
    pairingAttempts: number;
    pairingWindow: number; // minutes
    commandsPerMinute: number;
  };
  notifications: {
    enabled: boolean;
    types: Array<'ad_detection' | 'stream_status' | 'pip_status'>;
  };
}

// Error Types
export class MobileRemoteError extends Error {
  constructor(
    message: string,
    public code: MobileRemoteErrorCode,
    public details?: any
  ) {
    super(message);
    this.name = 'MobileRemoteError';
  }
}

export enum MobileRemoteErrorCode {
  DEVICE_NOT_FOUND = 'DEVICE_NOT_FOUND',
  DEVICE_NOT_PAIRED = 'DEVICE_NOT_PAIRED',
  INVALID_PAIRING_CODE = 'INVALID_PAIRING_CODE',
  PAIRING_EXPIRED = 'PAIRING_EXPIRED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  INSUFFICIENT_CAPABILITIES = 'INSUFFICIENT_CAPABILITIES',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  COMMAND_FAILED = 'COMMAND_FAILED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  VALIDATION_ERROR = 'VALIDATION_ERROR'
}
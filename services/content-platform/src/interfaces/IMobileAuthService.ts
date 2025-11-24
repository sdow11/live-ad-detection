/**
 * Mobile Authentication Service Interface
 * 
 * Defines contracts for mobile device authentication, pairing, and session management.
 * Implements SOLID principles for maintainable and extensible authentication system.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility: Each interface handles specific authentication concerns
 * - Open/Closed: Extensible for new authentication methods and security features
 * - Liskov Substitution: Implementations can be substituted without breaking functionality
 * - Interface Segregation: Separated concerns for different aspects of authentication
 * - Dependency Inversion: Depends on abstractions, not concrete implementations
 */

import { DeviceInfo, DeviceCapability } from './IMobileRemoteService';

// Core Authentication Service Interface (Single Responsibility)
export interface IMobileAuthService {
  // Pairing Operations
  generatePairingToken(userId: string, deviceInfo: DeviceInfo): Promise<PairingToken>;
  validatePairingToken(code: string): Promise<PairingValidationResult>;
  
  // Session Management
  createDeviceSession(deviceId: string, userId: string, capabilities: DeviceCapability[]): Promise<SessionCreationResult>;
  validateSession(sessionToken: string): Promise<SessionValidationResult>;
  refreshSessionToken(refreshToken: string): Promise<SessionRefreshResult>;
  revokeSession(sessionToken: string, reason: string): Promise<boolean>;
  
  // Security Operations
  validateDeviceFingerprint(deviceId: string, deviceInfo: DeviceInfo): Promise<FingerprintValidationResult>;
  rotateSessionTokens(refreshToken: string): Promise<TokenRotationResult>;
  
  // Maintenance
  cleanupExpiredTokensAndSessions(): Promise<CleanupResult>;
  getAuthenticationStats(): Promise<AuthenticationStats>;
}

// Token Generation Service Interface (Interface Segregation)
export interface ITokenGeneratorService {
  generatePairingCode(length?: number): string;
  generateSessionToken(): string;
  generateRefreshToken(): string;
  validateTokenFormat(token: string): boolean;
}

// QR Code Service Interface (Interface Segregation) 
export interface IQRCodeService {
  generateQRCode(data: QRCodeData): Promise<string>;
  encodeDataURL(data: any): string;
  validateQRCodeData(data: string): boolean;
}

// Audit Service Interface (Interface Segregation)
export interface IAuditService {
  createAuditLog(event: AuditEvent): Promise<void>;
  getAuditTrail(userId: string, timeRange?: TimeRange): Promise<AuditEvent[]>;
  getSecurityEvents(severity: SecuritySeverity, timeRange?: TimeRange): Promise<SecurityEvent[]>;
}

// Core Data Types
export interface PairingToken {
  code: string;
  token: string;
  expiresAt: Date;
  qrCodeDataURL?: string;
  instructions?: string;
}

export interface PairingValidationResult {
  valid: boolean;
  userId?: string;
  deviceInfo?: DeviceInfo;
  token?: string;
  error?: string;
  metadata?: {
    attempts?: number;
    lastAttempt?: Date;
    sourceIP?: string;
  };
}

export interface SessionCreationResult {
  success: boolean;
  sessionToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  capabilities?: DeviceCapability[];
  error?: string;
  metadata?: {
    deviceId?: string;
    previousSessions?: number;
    securityLevel?: SecurityLevel;
  };
}

export interface SessionValidationResult {
  valid: boolean;
  session?: {
    id: string;
    deviceId: string;
    userId: string;
    capabilities: DeviceCapability[];
    isActive: boolean;
    lastActivity: Date;
    securityLevel: SecurityLevel;
  };
  error?: string;
  actions?: SecurityAction[];
}

export interface SessionRefreshResult {
  success: boolean;
  newSessionToken?: string;
  newRefreshToken?: string;
  expiresAt?: Date;
  capabilities?: DeviceCapability[];
  error?: string;
  securityActions?: SecurityAction[];
}

export interface FingerprintValidationResult {
  valid: boolean;
  reason?: string;
  suspicious: boolean;
  riskScore?: number;
  recommendations?: SecurityRecommendation[];
}

export interface TokenRotationResult {
  success: boolean;
  newSessionToken?: string;
  newRefreshToken?: string;
  expiresAt?: Date;
  rotationId?: string;
  error?: string;
}

export interface CleanupResult {
  expiredTokens: number;
  expiredSessions: number;
  timestamp: Date;
  errors?: string[];
  performance?: {
    duration: number;
    recordsProcessed: number;
  };
}

export interface AuthenticationStats {
  activeSessions: number;
  activeTokens: number;
  pairedDevices: number;
  successRate: number;
  averageSessionDuration: number;
  securityEvents: SecurityEventSummary;
  performance: PerformanceMetrics;
}

// QR Code and Pairing Types
export interface QRCodeData {
  code: string;
  userId: string;
  appName: string;
  version?: string;
  timestamp?: Date;
  securityToken?: string;
}

export interface PairingAttempt {
  id: string;
  userId: string;
  code: string;
  deviceInfo: DeviceInfo;
  sourceIP: string;
  userAgent: string;
  timestamp: Date;
  status: PairingStatus;
  error?: string;
}

export enum PairingStatus {
  INITIATED = 'initiated',
  VALIDATED = 'validated',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
  FAILED = 'failed',
  SUSPICIOUS = 'suspicious'
}

// Security and Risk Assessment Types
export interface DeviceFingerprint {
  hardware: string;
  software: string;
  network: string;
  behavioral: BehavioralFingerprint;
  timestamp: Date;
}

export interface BehavioralFingerprint {
  typingPattern?: number[];
  touchPattern?: number[];
  usageHours?: number[];
  preferredFeatures?: string[];
  averageSessionLength?: number;
}

export enum SecurityLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum SecuritySeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
  EMERGENCY = 'emergency'
}

export interface SecurityAction {
  type: SecurityActionType;
  description: string;
  required: boolean;
  timestamp: Date;
}

export enum SecurityActionType {
  LOGOUT = 'logout',
  REFRESH_TOKEN = 'refresh_token',
  CHALLENGE_DEVICE = 'challenge_device',
  REQUIRE_REAUTH = 'require_reauth',
  BLOCK_DEVICE = 'block_device',
  ESCALATE_SECURITY = 'escalate_security'
}

export interface SecurityRecommendation {
  type: 'security_enhancement' | 'policy_update' | 'monitoring_alert';
  description: string;
  priority: 'low' | 'medium' | 'high';
  actionRequired: boolean;
}

// Audit and Logging Types
export interface AuditEvent {
  id: string;
  event: AuditEventType;
  userId: string;
  deviceId?: string;
  sessionId?: string;
  timestamp: Date;
  sourceIP: string;
  userAgent: string;
  metadata: Record<string, any>;
  result: 'success' | 'failure' | 'warning';
  riskScore?: number;
}

export enum AuditEventType {
  PAIRING_INITIATED = 'pairing_initiated',
  PAIRING_COMPLETED = 'pairing_completed',
  PAIRING_FAILED = 'pairing_failed',
  SESSION_CREATED = 'session_created',
  SESSION_VALIDATED = 'session_validated',
  SESSION_REFRESHED = 'session_refreshed',
  SESSION_EXPIRED = 'session_expired',
  SESSION_REVOKED = 'session_revoked',
  TOKEN_ROTATED = 'token_rotated',
  SECURITY_VIOLATION = 'security_violation',
  DEVICE_BLOCKED = 'device_blocked',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity'
}

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: SecuritySeverity;
  description: string;
  userId?: string;
  deviceId?: string;
  sourceIP: string;
  timestamp: Date;
  metadata: Record<string, any>;
  resolved: boolean;
  actions: SecurityAction[];
}

export enum SecurityEventType {
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  SUSPICIOUS_LOGIN_PATTERN = 'suspicious_login_pattern',
  DEVICE_FINGERPRINT_MISMATCH = 'device_fingerprint_mismatch',
  TOKEN_TAMPERING_DETECTED = 'token_tampering_detected',
  CONCURRENT_SESSION_ABUSE = 'concurrent_session_abuse',
  GEOGRAPHICAL_ANOMALY = 'geographical_anomaly',
  BRUTE_FORCE_ATTEMPT = 'brute_force_attempt',
  MALFORMED_REQUEST = 'malformed_request'
}

export interface SecurityEventSummary {
  total: number;
  byType: Record<SecurityEventType, number>;
  bySeverity: Record<SecuritySeverity, number>;
  resolved: number;
  pending: number;
  lastEvent?: Date;
}

// Performance and Monitoring Types
export interface PerformanceMetrics {
  averageResponseTime: number;
  throughput: number;
  errorRate: number;
  availabilityPercentage: number;
  cacheHitRatio: number;
  databaseConnectionPool: {
    active: number;
    idle: number;
    total: number;
  };
}

export interface TimeRange {
  start: Date;
  end: Date;
}

// Configuration and Policy Types
export interface MobileAuthConfig {
  pairing: {
    codeLength: number;
    codeExpiry: number; // minutes
    maxAttemptsPerUser: number;
    maxAttemptsPerIP: number;
    requireQRCode: boolean;
    allowCaseSensitive: boolean;
  };
  
  session: {
    tokenLength: number;
    sessionExpiry: number; // minutes
    refreshTokenExpiry: number; // hours
    maxSessionsPerDevice: number;
    maxSessionsPerUser: number;
    idleTimeout: number; // minutes
    enableTokenRotation: boolean;
    rotationInterval: number; // hours
  };
  
  security: {
    enableFingerprinting: boolean;
    fingerprintTolerance: number; // 0.0 to 1.0
    enableBehavioralAnalysis: boolean;
    riskThreshold: number; // 0.0 to 1.0
    enableGeolocation: boolean;
    maxSuspiciousEvents: number;
    blockDuration: number; // minutes
  };
  
  cleanup: {
    enableAutoCleanup: boolean;
    cleanupInterval: number; // hours
    retentionPeriod: number; // days
    batchSize: number;
  };
  
  monitoring: {
    enableMetrics: boolean;
    metricsInterval: number; // seconds
    enableAlerts: boolean;
    alertThresholds: {
      errorRate: number;
      responseTime: number;
      securityEvents: number;
    };
  };
}

// Rate Limiting Types
export interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
  blockDuration: number;
  whitelistIPs?: string[];
  blacklistIPs?: string[];
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;
}

// Error Types with Enhanced Context
export class MobileAuthError extends Error {
  constructor(
    message: string,
    public code: MobileAuthErrorCode,
    public context?: {
      userId?: string;
      deviceId?: string;
      sessionId?: string;
      sourceIP?: string;
      timestamp?: Date;
      metadata?: Record<string, any>;
    }
  ) {
    super(message);
    this.name = 'MobileAuthError';
  }
}

export enum MobileAuthErrorCode {
  // Pairing Errors
  INVALID_DEVICE_INFO = 'INVALID_DEVICE_INFO',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  PAIRING_CODE_EXPIRED = 'PAIRING_CODE_EXPIRED',
  PAIRING_CODE_INVALID = 'PAIRING_CODE_INVALID',
  PAIRING_CODE_USED = 'PAIRING_CODE_USED',
  
  // Session Errors
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_INVALID = 'SESSION_INVALID',
  TOKEN_MALFORMED = 'TOKEN_MALFORMED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  REFRESH_TOKEN_INVALID = 'REFRESH_TOKEN_INVALID',
  
  // Security Errors
  DEVICE_FINGERPRINT_MISMATCH = 'DEVICE_FINGERPRINT_MISMATCH',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  INSUFFICIENT_PRIVILEGES = 'INSUFFICIENT_PRIVILEGES',
  DEVICE_BLOCKED = 'DEVICE_BLOCKED',
  
  // System Errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR'
}

// Extended Device Information for Security
export interface ExtendedDeviceInfo extends DeviceInfo {
  fingerprint?: string;
  geolocation?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: Date;
  };
  networkInfo?: {
    type: 'wifi' | 'cellular' | 'ethernet' | 'unknown';
    carrier?: string;
    ipAddress: string;
    userAgent: string;
  };
  securityFeatures?: {
    biometricEnabled: boolean;
    screenLockEnabled: boolean;
    appPinEnabled: boolean;
    jailbroken: boolean;
  };
}
/**
 * Authentication Provider Interface
 * 
 * Strategy Pattern implementation for pluggable authentication providers.
 * Supports Firebase, AWS Cognito, Google Cloud Identity, Azure AD, and custom JWT.
 * 
 * Design Principles:
 * - Strategy Pattern: Interchangeable authentication implementations
 * - Dependency Inversion: High-level modules depend on this abstraction
 * - Interface Segregation: Focused on authentication concerns only
 * - Open/Closed: Extensible for new auth providers without modification
 */

export interface IAuthProvider {
  // Provider identification
  readonly providerType: AuthProviderType;
  readonly providerName: string;

  // Core authentication methods
  authenticate(credentials: AuthCredentials): Promise<AuthResult>;
  validateToken(token: string): Promise<TokenValidationResult>;
  refreshToken(refreshToken: string): Promise<AuthResult>;
  revokeToken(token: string): Promise<void>;

  // User management
  createUser(userData: CreateUserRequest): Promise<User>;
  getUserById(userId: string): Promise<User | null>;
  updateUser(userId: string, updates: UpdateUserRequest): Promise<User>;
  deleteUser(userId: string): Promise<void>;

  // Session management
  createSession(userId: string, metadata?: SessionMetadata): Promise<AuthSession>;
  validateSession(sessionToken: string): Promise<SessionValidationResult>;
  endSession(sessionToken: string): Promise<void>;

  // Provider-specific operations
  initialize(config: AuthProviderConfig): Promise<void>;
  isHealthy(): Promise<boolean>;
  getProviderMetrics(): Promise<AuthProviderMetrics>;
}

// Authentication Types
export type AuthProviderType = 'firebase' | 'cognito' | 'google' | 'azure' | 'jwt';

export interface AuthCredentials {
  type: 'email_password' | 'oauth' | 'api_key' | 'service_account';
  email?: string;
  password?: string;
  oauthToken?: string;
  apiKey?: string;
  serviceAccountKey?: string;
  metadata?: Record<string, any>;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  error?: AuthError;
  metadata?: Record<string, any>;
}

export interface TokenValidationResult {
  valid: boolean;
  user?: User;
  permissions?: string[];
  roles?: string[];
  expiresAt?: Date;
  error?: string;
}

// User Management
export interface User {
  id: string;
  email: string;
  displayName?: string;
  avatar?: string;
  roles: string[];
  permissions: string[];
  metadata?: Record<string, any>;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserRequest {
  email: string;
  password?: string;
  displayName?: string;
  roles?: string[];
  metadata?: Record<string, any>;
}

export interface UpdateUserRequest {
  displayName?: string;
  email?: string;
  roles?: string[];
  metadata?: Record<string, any>;
  isActive?: boolean;
}

// Session Management
export interface AuthSession {
  id: string;
  userId: string;
  token: string;
  refreshToken?: string;
  expiresAt: Date;
  metadata?: SessionMetadata;
  createdAt: Date;
  lastActivity: Date;
}

export interface SessionMetadata {
  deviceId?: string;
  deviceType?: string;
  ipAddress?: string;
  userAgent?: string;
  location?: {
    country?: string;
    city?: string;
  };
}

export interface SessionValidationResult {
  valid: boolean;
  session?: AuthSession;
  user?: User;
  error?: string;
}

// Provider Configuration
export interface AuthProviderConfig {
  type: AuthProviderType;
  firebase?: FirebaseConfig;
  cognito?: CognitoConfig;
  google?: GoogleConfig;
  azure?: AzureConfig;
  jwt?: JWTConfig;
}

export interface FirebaseConfig {
  projectId: string;
  serviceAccountKey: string;
  databaseURL?: string;
  apiKey?: string;
}

export interface CognitoConfig {
  userPoolId: string;
  clientId: string;
  clientSecret?: string;
  region: string;
  identityPoolId?: string;
}

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  projectId: string;
  serviceAccountKey?: string;
}

export interface AzureConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  authority?: string;
}

export interface JWTConfig {
  secretKey: string;
  algorithm: 'HS256' | 'RS256';
  expiresIn: string;
  refreshExpiresIn: string;
  issuer?: string;
  audience?: string;
}

// Error Handling
export interface AuthError {
  code: AuthErrorCode;
  message: string;
  details?: Record<string, any>;
}

export enum AuthErrorCode {
  INVALID_CREDENTIALS = 'invalid_credentials',
  USER_NOT_FOUND = 'user_not_found',
  USER_DISABLED = 'user_disabled',
  TOKEN_EXPIRED = 'token_expired',
  TOKEN_INVALID = 'token_invalid',
  PERMISSION_DENIED = 'permission_denied',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  PROVIDER_UNAVAILABLE = 'provider_unavailable',
  CONFIGURATION_ERROR = 'configuration_error'
}

// Metrics and Monitoring
export interface AuthProviderMetrics {
  totalRequests: number;
  successfulAuths: number;
  failedAuths: number;
  averageResponseTime: number;
  errorRate: number;
  activeUsers: number;
  activeSessions: number;
  lastHealthCheck: Date;
}
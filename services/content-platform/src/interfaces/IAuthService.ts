/**
 * Authentication Service Interface
 * 
 * Defines the contract for user authentication and authorization
 * Supports JWT tokens, role-based access control, and session management
 */

export interface User {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface UserRole {
  id: string;
  name: string;
  permissions: Permission[];
  description?: string;
}

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  tokenType: 'Bearer';
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  email: string;
  password: string;
  username: string;
  firstName: string;
  lastName: string;
}

export interface ResetPasswordData {
  token: string;
  newPassword: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  userAgent: string;
  ipAddress: string;
  isActive: boolean;
  createdAt: Date;
  lastUsedAt: Date;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  tokens?: AuthTokens;
  session?: AuthSession;
  message?: string;
}

export interface IAuthService {
  /**
   * Authenticate user with email and password
   */
  login(credentials: LoginCredentials): Promise<AuthResult>;

  /**
   * Register new user
   */
  register(userData: RegisterData): Promise<AuthResult>;

  /**
   * Logout user and invalidate session
   */
  logout(userId: string, sessionId?: string): Promise<boolean>;

  /**
   * Refresh access token using refresh token
   */
  refreshToken(refreshToken: string): Promise<AuthResult>;

  /**
   * Verify and decode JWT token
   */
  verifyToken(token: string): Promise<User | null>;

  /**
   * Get user by ID
   */
  getUserById(userId: string): Promise<User | null>;

  /**
   * Get user by email
   */
  getUserByEmail(email: string): Promise<User | null>;

  /**
   * Update user profile
   */
  updateUser(userId: string, updateData: Partial<User>): Promise<User>;

  /**
   * Change user password
   */
  changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean>;

  /**
   * Request password reset
   */
  requestPasswordReset(email: string): Promise<boolean>;

  /**
   * Reset password with token
   */
  resetPassword(resetData: ResetPasswordData): Promise<boolean>;

  /**
   * Verify email address
   */
  verifyEmail(token: string): Promise<boolean>;

  /**
   * Check if user has permission
   */
  hasPermission(userId: string, resource: string, action: string): Promise<boolean>;

  /**
   * Get user permissions
   */
  getUserPermissions(userId: string): Promise<Permission[]>;

  /**
   * Get active sessions for user
   */
  getUserSessions(userId: string): Promise<AuthSession[]>;

  /**
   * Revoke session
   */
  revokeSession(sessionId: string): Promise<boolean>;

  /**
   * Revoke all sessions for user
   */
  revokeAllSessions(userId: string): Promise<number>;

  /**
   * Get authentication statistics
   */
  getAuthStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    activeSessions: number;
    loginAttempts24h: number;
    failedAttempts24h: number;
  }>;
}
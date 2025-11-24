import { Repository } from 'typeorm';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { IAuthService, User as IUser, UserRole as IUserRole, Permission as IPermission, AuthTokens, LoginCredentials, RegisterData, ResetPasswordData, AuthSession as IAuthSession, AuthResult } from '@/interfaces/IAuthService';
import { User } from '@/models/User';
import { UserRole } from '@/models/UserRole';
import { Permission } from '@/models/Permission';
import { AuthSession } from '@/models/AuthSession';
import { Logger } from '@/utils/Logger';
import { ValidationError } from '@/utils/validation';

/**
 * Authentication Service Implementation
 * 
 * Handles user authentication, authorization, and session management
 * Implements JWT-based authentication with refresh tokens
 * 
 * Single Responsibility: Authentication and authorization logic
 * Open/Closed: Extensible for additional auth methods
 * Liskov Substitution: Implements IAuthService interface
 * Interface Segregation: Focused on auth concerns
 * Dependency Inversion: Uses injected repositories
 */

export class AuthService implements IAuthService {
  private logger: Logger;
  private jwtSecret: string;
  private jwtRefreshSecret: string;
  private accessTokenExpiry: string;
  private refreshTokenExpiry: string;

  constructor(
    private userRepository: Repository<User>,
    private userRoleRepository: Repository<UserRole>,
    private permissionRepository: Repository<Permission>,
    private authSessionRepository: Repository<AuthSession>
  ) {
    this.logger = new Logger('AuthService');
    
    // JWT configuration
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
    this.accessTokenExpiry = process.env.JWT_EXPIRY || '24h';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '30d';

    if (this.jwtSecret === 'your-secret-key' || this.jwtRefreshSecret === 'your-refresh-secret-key') {
      this.logger.warn('Using default JWT secrets. Please set JWT_SECRET and JWT_REFRESH_SECRET environment variables.');
    }
  }

  /**
   * Authenticate user with email and password
   */
  async login(credentials: LoginCredentials): Promise<AuthResult> {
    try {
      const { email, password, rememberMe = false } = credentials;

      // Find user by email
      const user = await this.userRepository.findOne({
        where: { email: email.toLowerCase() },
        relations: ['role', 'role.permissions']
      });

      if (!user) {
        return {
          success: false,
          message: 'Invalid email or password'
        };
      }

      // Check if user is active
      if (!user.isActive) {
        return {
          success: false,
          message: 'Account is disabled'
        };
      }

      // Verify password
      const isValidPassword = await user.verifyPassword(password);
      if (!isValidPassword) {
        return {
          success: false,
          message: 'Invalid email or password'
        };
      }

      // Update last login
      user.updateLastLogin();
      await this.userRepository.save(user);

      // Create session and tokens
      const tokens = await this.generateTokens(user, rememberMe);
      const session = await this.createSession(user, tokens, rememberMe);

      this.logger.info(`User logged in: ${user.email} (${user.id})`);

      return {
        success: true,
        user: user.toSafeJSON(),
        tokens,
        session: session.toSafeJSON()
      };
    } catch (error) {
      this.logger.error('Login failed:', error);
      return {
        success: false,
        message: 'Login failed due to server error'
      };
    }
  }

  /**
   * Register new user
   */
  async register(userData: RegisterData): Promise<AuthResult> {
    try {
      const { email, password, username, firstName, lastName } = userData;

      // Validate input
      if (!User.isValidEmail(email)) {
        throw new ValidationError('Invalid email format');
      }

      if (!User.isValidUsername(username)) {
        throw new ValidationError('Invalid username format');
      }

      const passwordValidation = User.isValidPassword(password);
      if (!passwordValidation.valid) {
        throw new ValidationError(`Invalid password: ${passwordValidation.errors.join(', ')}`);
      }

      // Check if email already exists
      const existingUserByEmail = await this.userRepository.findOne({
        where: { email: email.toLowerCase() }
      });

      if (existingUserByEmail) {
        return {
          success: false,
          message: 'Email already registered'
        };
      }

      // Check if username already exists
      const existingUserByUsername = await this.userRepository.findOne({
        where: { username: username.toLowerCase() }
      });

      if (existingUserByUsername) {
        return {
          success: false,
          message: 'Username already taken'
        };
      }

      // Get default user role
      const defaultRole = await this.userRoleRepository.findOne({
        where: { name: UserRole.getDefaultRoleName() },
        relations: ['permissions']
      });

      if (!defaultRole) {
        throw new Error('Default user role not found');
      }

      // Create user
      const user = new User();
      user.email = email.toLowerCase();
      user.username = username.toLowerCase();
      user.firstName = firstName.trim();
      user.lastName = lastName.trim();
      user.role = defaultRole;
      user.setPassword(password);

      const savedUser = await this.userRepository.save(user);

      this.logger.info(`User registered: ${savedUser.email} (${savedUser.id})`);

      return {
        success: true,
        user: savedUser.toSafeJSON(),
        message: 'Registration successful'
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        return {
          success: false,
          message: error.message
        };
      }

      this.logger.error('Registration failed:', error);
      return {
        success: false,
        message: 'Registration failed due to server error'
      };
    }
  }

  /**
   * Logout user and invalidate session
   */
  async logout(userId: string, sessionId?: string): Promise<boolean> {
    try {
      if (sessionId) {
        // Logout specific session
        const session = await this.authSessionRepository.findOne({
          where: { id: sessionId, userId, isActive: true }
        });

        if (session) {
          session.revoke();
          await this.authSessionRepository.save(session);
          this.logger.info(`Session logged out: ${sessionId} for user ${userId}`);
          return true;
        }
      } else {
        // Logout all sessions for user
        await this.authSessionRepository.update(
          { userId, isActive: true },
          { isActive: false }
        );
        this.logger.info(`All sessions logged out for user ${userId}`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('Logout failed:', error);
      return false;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<AuthResult> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.jwtRefreshSecret) as any;
      const { userId, sessionId } = decoded;

      // Find active session
      const session = await this.authSessionRepository.findOne({
        where: { id: sessionId, userId, isActive: true },
        relations: ['user', 'user.role', 'user.role.permissions']
      });

      if (!session || session.refreshToken !== refreshToken) {
        return {
          success: false,
          message: 'Invalid refresh token'
        };
      }

      if (session.isExpired()) {
        return {
          success: false,
          message: 'Session expired'
        };
      }

      // Generate new tokens
      const tokens = await this.generateTokens(session.user);
      
      // Update session
      session.accessToken = tokens.accessToken;
      session.refreshToken = tokens.refreshToken;
      session.expiresAt = tokens.expiresAt;
      session.updateActivity();
      
      await this.authSessionRepository.save(session);

      this.logger.debug(`Token refreshed for user ${userId}`);

      return {
        success: true,
        user: session.user.toSafeJSON(),
        tokens,
        session: session.toSafeJSON()
      };
    } catch (error) {
      this.logger.error('Token refresh failed:', error);
      return {
        success: false,
        message: 'Token refresh failed'
      };
    }
  }

  /**
   * Verify and decode JWT token
   */
  async verifyToken(token: string): Promise<User | null> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      const { userId, sessionId } = decoded;

      // Find active session
      const session = await this.authSessionRepository.findOne({
        where: { id: sessionId, userId, isActive: true },
        relations: ['user', 'user.role', 'user.role.permissions']
      });

      if (!session || session.accessToken !== token || !session.isValid()) {
        return null;
      }

      // Update session activity
      session.updateActivity();
      await this.authSessionRepository.save(session);

      return session.user;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['role', 'role.permissions']
      });

      return user || null;
    } catch (error) {
      this.logger.error('Get user by ID failed:', error);
      return null;
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { email: email.toLowerCase() },
        relations: ['role', 'role.permissions']
      });

      return user || null;
    } catch (error) {
      this.logger.error('Get user by email failed:', error);
      return null;
    }
  }

  /**
   * Update user profile
   */
  async updateUser(userId: string, updateData: Partial<User>): Promise<User> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new ValidationError('User not found');
      }

      // Update allowed fields
      const allowedFields = ['firstName', 'lastName', 'metadata'];
      for (const field of allowedFields) {
        if (field in updateData && updateData[field as keyof User] !== undefined) {
          (user as any)[field] = updateData[field as keyof User];
        }
      }

      const updatedUser = await this.userRepository.save(user);
      this.logger.info(`User updated: ${user.email} (${user.id})`);

      return updatedUser;
    } catch (error) {
      this.logger.error('Update user failed:', error);
      throw error;
    }
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new ValidationError('User not found');
      }

      // Verify current password
      const isValidPassword = await user.verifyPassword(currentPassword);
      if (!isValidPassword) {
        throw new ValidationError('Current password is incorrect');
      }

      // Validate new password
      const passwordValidation = User.isValidPassword(newPassword);
      if (!passwordValidation.valid) {
        throw new ValidationError(`Invalid password: ${passwordValidation.errors.join(', ')}`);
      }

      // Update password
      user.setPassword(newPassword);
      await this.userRepository.save(user);

      // Revoke all existing sessions except current
      await this.authSessionRepository.update(
        { userId },
        { isActive: false }
      );

      this.logger.info(`Password changed for user: ${user.email} (${user.id})`);
      return true;
    } catch (error) {
      this.logger.error('Change password failed:', error);
      if (error instanceof ValidationError) {
        throw error;
      }
      return false;
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<boolean> {
    try {
      const user = await this.getUserByEmail(email);
      if (!user) {
        // Don't reveal if email exists
        return true;
      }

      // Generate reset token
      const resetToken = user.generatePasswordResetToken();
      await this.userRepository.save(user);

      // TODO: Send email with reset token
      this.logger.info(`Password reset requested for: ${user.email}`);

      return true;
    } catch (error) {
      this.logger.error('Password reset request failed:', error);
      return false;
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(resetData: ResetPasswordData): Promise<boolean> {
    try {
      const { token, newPassword } = resetData;

      // Find user by reset token
      const user = await this.userRepository.findOne({
        where: { passwordResetToken: token }
      });

      if (!user || !user.verifyPasswordResetToken(token)) {
        throw new ValidationError('Invalid or expired reset token');
      }

      // Validate new password
      const passwordValidation = User.isValidPassword(newPassword);
      if (!passwordValidation.valid) {
        throw new ValidationError(`Invalid password: ${passwordValidation.errors.join(', ')}`);
      }

      // Update password and clear reset token
      user.setPassword(newPassword);
      user.clearPasswordResetToken();
      await this.userRepository.save(user);

      // Revoke all existing sessions
      await this.authSessionRepository.update(
        { userId: user.id },
        { isActive: false }
      );

      this.logger.info(`Password reset completed for: ${user.email} (${user.id})`);
      return true;
    } catch (error) {
      this.logger.error('Password reset failed:', error);
      if (error instanceof ValidationError) {
        throw error;
      }
      return false;
    }
  }

  /**
   * Verify email address
   */
  async verifyEmail(token: string): Promise<boolean> {
    try {
      const user = await this.userRepository.findOne({
        where: { emailVerificationToken: token }
      });

      if (!user || !user.verifyEmailVerificationToken(token)) {
        return false;
      }

      await this.userRepository.save(user);
      this.logger.info(`Email verified for: ${user.email} (${user.id})`);

      return true;
    } catch (error) {
      this.logger.error('Email verification failed:', error);
      return false;
    }
  }

  /**
   * Check if user has permission
   */
  async hasPermission(userId: string, resource: string, action: string): Promise<boolean> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        return false;
      }

      return user.hasPermission(resource, action);
    } catch (error) {
      this.logger.error('Permission check failed:', error);
      return false;
    }
  }

  /**
   * Get user permissions
   */
  async getUserPermissions(userId: string): Promise<Permission[]> {
    try {
      const user = await this.getUserById(userId);
      if (!user || !user.role) {
        return [];
      }

      return user.role.permissions || [];
    } catch (error) {
      this.logger.error('Get user permissions failed:', error);
      return [];
    }
  }

  /**
   * Get active sessions for user
   */
  async getUserSessions(userId: string): Promise<AuthSession[]> {
    try {
      const sessions = await this.authSessionRepository.find({
        where: { userId, isActive: true },
        order: { lastUsedAt: 'DESC' }
      });

      return sessions;
    } catch (error) {
      this.logger.error('Get user sessions failed:', error);
      return [];
    }
  }

  /**
   * Revoke session
   */
  async revokeSession(sessionId: string): Promise<boolean> {
    try {
      const session = await this.authSessionRepository.findOne({
        where: { id: sessionId, isActive: true }
      });

      if (!session) {
        return false;
      }

      session.revoke();
      await this.authSessionRepository.save(session);

      this.logger.info(`Session revoked: ${sessionId}`);
      return true;
    } catch (error) {
      this.logger.error('Revoke session failed:', error);
      return false;
    }
  }

  /**
   * Revoke all sessions for user
   */
  async revokeAllSessions(userId: string): Promise<number> {
    try {
      const result = await this.authSessionRepository.update(
        { userId, isActive: true },
        { isActive: false }
      );

      const revokedCount = result.affected || 0;
      this.logger.info(`Revoked ${revokedCount} sessions for user ${userId}`);

      return revokedCount;
    } catch (error) {
      this.logger.error('Revoke all sessions failed:', error);
      return 0;
    }
  }

  /**
   * Get authentication statistics
   */
  async getAuthStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    activeSessions: number;
    loginAttempts24h: number;
    failedAttempts24h: number;
  }> {
    try {
      const totalUsers = await this.userRepository.count();
      const activeUsers = await this.userRepository.count({ where: { isActive: true } });
      const activeSessions = await this.authSessionRepository.count({ where: { isActive: true } });

      // TODO: Implement login attempt tracking
      const loginAttempts24h = 0;
      const failedAttempts24h = 0;

      return {
        totalUsers,
        activeUsers,
        activeSessions,
        loginAttempts24h,
        failedAttempts24h
      };
    } catch (error) {
      this.logger.error('Get auth stats failed:', error);
      return {
        totalUsers: 0,
        activeUsers: 0,
        activeSessions: 0,
        loginAttempts24h: 0,
        failedAttempts24h: 0
      };
    }
  }

  /**
   * Generate JWT tokens for user
   */
  private async generateTokens(user: User, rememberMe: boolean = false): Promise<AuthTokens> {
    const expiresAt = AuthSession.calculateExpiration(rememberMe);
    
    const sessionData = {
      userId: user.id,
      email: user.email,
      role: user.role.name
    };

    // Create temporary session ID for token generation
    const tempSessionId = crypto.randomUUID();

    const accessToken = jwt.sign(
      { ...sessionData, sessionId: tempSessionId },
      this.jwtSecret,
      { expiresIn: this.accessTokenExpiry }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, sessionId: tempSessionId },
      this.jwtRefreshSecret,
      { expiresIn: this.refreshTokenExpiry }
    );

    return {
      accessToken,
      refreshToken,
      expiresAt,
      tokenType: 'Bearer'
    };
  }

  /**
   * Create auth session
   */
  private async createSession(user: User, tokens: AuthTokens, rememberMe: boolean): Promise<AuthSession> {
    const session = new AuthSession();
    session.userId = user.id;
    session.user = user;
    session.accessToken = tokens.accessToken;
    session.refreshToken = tokens.refreshToken;
    session.expiresAt = tokens.expiresAt;
    session.isActive = true;

    return await this.authSessionRepository.save(session);
  }
}
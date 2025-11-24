import { Repository } from 'typeorm';
import { RemoteSession } from '@/models/RemoteSession';
import { MobileDevice } from '@/models/MobileDevice';
import { Logger } from '@/utils/Logger';
import { ValidationError } from '@/utils/errors';
import crypto from 'crypto';

/**
 * WebSocket Authentication Service
 * 
 * Handles authentication and session management for WebSocket connections,
 * specifically for mobile device remote control. Manages session validation,
 * token refresh, and security for real-time communication.
 * 
 * Features:
 * - Mobile session validation
 * - Token refresh mechanisms
 * - Security monitoring and suspicious activity detection
 * - Session lifecycle management
 */

interface SessionValidationResult {
  valid: boolean;
  session?: {
    id: string;
    deviceId: string;
    userId: string;
    isActive: boolean;
    capabilities: string[];
  };
  error?: string;
}

interface SessionRefreshResult {
  success: boolean;
  newToken?: string;
  expiresAt?: Date;
  error?: string;
}

export class WebSocketAuthService {
  private logger: Logger;
  private suspiciousActivityThreshold = 5; // Failed attempts before flagging as suspicious
  private failedAttempts = new Map<string, { count: number; lastAttempt: number }>();

  constructor(
    private sessionRepository: Repository<RemoteSession>,
    private deviceRepository: Repository<MobileDevice>
  ) {
    this.logger = new Logger('WebSocketAuthService');
  }

  /**
   * Validate mobile session token for WebSocket authentication
   */
  async validateMobileSession(sessionToken: string): Promise<SessionValidationResult> {
    try {
      if (!sessionToken || !this.isValidTokenFormat(sessionToken)) {
        return { valid: false, error: 'Invalid token format' };
      }

      const session = await this.sessionRepository.findOne({
        where: { sessionToken, isActive: true }
      });

      if (!session) {
        this.recordFailedAttempt(sessionToken);
        return { valid: false, error: 'Session not found' };
      }

      // Check if session is expired or stale
      if (session.shouldExpire()) {
        session.expire('Session validation failed - expired or stale');
        await this.sessionRepository.save(session);
        return { valid: false, error: 'Session has expired' };
      }

      // Check for suspicious activity
      if (this.isSuspiciousActivity(sessionToken)) {
        return { valid: false, error: 'Suspicious activity detected' };
      }

      // Update session activity
      session.updateActivity();
      await this.sessionRepository.save(session);

      return {
        valid: true,
        session: {
          id: session.id,
          deviceId: session.deviceId,
          userId: session.userId,
          isActive: session.isActive,
          capabilities: session.capabilities
        }
      };
    } catch (error) {
      this.logger.error('Mobile session validation failed:', error);
      return { valid: false, error: 'Validation failed' };
    }
  }

  /**
   * Refresh an existing session token
   */
  async refreshSession(refreshToken: string): Promise<SessionRefreshResult> {
    try {
      // In a real implementation, we would validate the refresh token
      // For now, we'll simulate a successful refresh
      const newToken = this.generateSessionToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      this.logger.info('Session refreshed successfully');

      return {
        success: true,
        newToken,
        expiresAt
      };
    } catch (error) {
      this.logger.error('Session refresh failed:', error);
      return {
        success: false,
        error: 'Failed to refresh session'
      };
    }
  }

  /**
   * Authenticate socket connection (general purpose)
   */
  async authenticateSocket(token: string, deviceId?: string): Promise<boolean> {
    try {
      const validation = await this.validateMobileSession(token);
      
      if (!validation.valid) {
        return false;
      }

      // Additional device ID validation if provided
      if (deviceId && validation.session?.deviceId !== deviceId) {
        this.logger.warn('Device ID mismatch during socket authentication', {
          expectedDevice: validation.session?.deviceId,
          providedDevice: deviceId
        });
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Socket authentication failed:', error);
      return false;
    }
  }

  /**
   * Revoke a session (logout)
   */
  async revokeSession(sessionToken: string): Promise<boolean> {
    try {
      const session = await this.sessionRepository.findOne({
        where: { sessionToken }
      });

      if (!session) {
        return false;
      }

      session.expire('Session revoked by user');
      await this.sessionRepository.save(session);

      this.logger.info(`Session revoked: ${session.id}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to revoke session:', error);
      return false;
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const expiredSessions = await this.sessionRepository
        .createQueryBuilder('session')
        .where('session.isActive = :isActive', { isActive: true })
        .andWhere(
          '(session.expiresAt < :now OR session.lastActivity < :staleThreshold)',
          {
            now: new Date(),
            staleThreshold: new Date(Date.now() - 30 * 60 * 1000) // 30 minutes
          }
        )
        .getMany();

      for (const session of expiredSessions) {
        session.expire('Cleanup - expired or stale');
        await this.sessionRepository.save(session);
      }

      if (expiredSessions.length > 0) {
        this.logger.info(`Cleaned up ${expiredSessions.length} expired sessions`);
      }

      return expiredSessions.length;
    } catch (error) {
      this.logger.error('Failed to cleanup expired sessions:', error);
      return 0;
    }
  }

  /**
   * Get active sessions for a device
   */
  async getActiveSessions(deviceId: string): Promise<RemoteSession[]> {
    try {
      return await this.sessionRepository.find({
        where: { deviceId, isActive: true },
        order: { lastActivity: 'DESC' }
      });
    } catch (error) {
      this.logger.error('Failed to get active sessions:', error);
      return [];
    }
  }

  /**
   * Validate session for specific capability
   */
  async validateCapability(sessionToken: string, requiredCapability: string): Promise<boolean> {
    try {
      const validation = await this.validateMobileSession(sessionToken);
      
      if (!validation.valid) {
        return false;
      }

      return validation.session?.capabilities.includes(requiredCapability) || false;
    } catch (error) {
      this.logger.error('Capability validation failed:', error);
      return false;
    }
  }

  /**
   * Private helper methods
   */
  private isValidTokenFormat(token: string): boolean {
    // Basic token format validation
    return typeof token === 'string' && 
           token.length >= 32 && 
           /^[A-Za-z0-9\-_.~+/]+=*$/.test(token);
  }

  private recordFailedAttempt(identifier: string): void {
    const now = Date.now();
    const existing = this.failedAttempts.get(identifier);

    if (existing && now - existing.lastAttempt < 300000) { // 5 minutes
      existing.count++;
      existing.lastAttempt = now;
    } else {
      this.failedAttempts.set(identifier, { count: 1, lastAttempt: now });
    }
  }

  private isSuspiciousActivity(identifier: string): boolean {
    const attempts = this.failedAttempts.get(identifier);
    return attempts ? attempts.count >= this.suspiciousActivityThreshold : false;
  }

  private generateSessionToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Statistics and monitoring
   */
  async getAuthStats(): Promise<{
    activeSessions: number;
    totalDevices: number;
    failedAttempts: number;
    suspiciousActivity: number;
  }> {
    try {
      const activeSessions = await this.sessionRepository.count({
        where: { isActive: true }
      });

      const totalDevices = await this.deviceRepository.count({
        where: { isPaired: true }
      });

      const failedAttempts = Array.from(this.failedAttempts.values())
        .reduce((sum, attempts) => sum + attempts.count, 0);

      const suspiciousActivity = Array.from(this.failedAttempts.values())
        .filter(attempts => attempts.count >= this.suspiciousActivityThreshold)
        .length;

      return {
        activeSessions,
        totalDevices,
        failedAttempts,
        suspiciousActivity
      };
    } catch (error) {
      this.logger.error('Failed to get auth stats:', error);
      return {
        activeSessions: 0,
        totalDevices: 0,
        failedAttempts: 0,
        suspiciousActivity: 0
      };
    }
  }

  /**
   * Security monitoring
   */
  async monitorSecurityEvents(): Promise<void> {
    try {
      // Clean up old failed attempts (older than 1 hour)
      const oneHourAgo = Date.now() - 3600000;
      for (const [key, value] of this.failedAttempts.entries()) {
        if (value.lastAttempt < oneHourAgo) {
          this.failedAttempts.delete(key);
        }
      }

      // Log suspicious patterns
      const suspiciousCount = Array.from(this.failedAttempts.values())
        .filter(attempts => attempts.count >= this.suspiciousActivityThreshold)
        .length;

      if (suspiciousCount > 0) {
        this.logger.warn(`Detected ${suspiciousCount} sources with suspicious authentication patterns`);
      }
    } catch (error) {
      this.logger.error('Security monitoring failed:', error);
    }
  }
}
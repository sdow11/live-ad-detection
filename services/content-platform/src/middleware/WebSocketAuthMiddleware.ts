import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io/dist/namespace';
import { WebSocketAuthService } from '@/services/WebSocketAuthService';
import { Logger } from '@/utils/Logger';

/**
 * WebSocket Authentication Middleware
 * 
 * Provides authentication middleware for Socket.IO connections, specifically
 * for mobile device remote control. Validates session tokens, manages rate
 * limiting, and handles security concerns before allowing WebSocket connections.
 * 
 * Features:
 * - Pre-connection authentication
 * - Rate limiting by IP and device
 * - Security monitoring and threat detection
 * - Connection validation and filtering
 */

interface AuthenticatedSocket extends Socket {
  data: {
    authenticated?: boolean;
    deviceId?: string;
    userId?: string;
    capabilities?: string[];
    ipAddress?: string;
    userAgent?: string;
  };
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
}

export class WebSocketAuthMiddleware {
  private logger: Logger;
  private rateLimitCache = new Map<string, RateLimitEntry>();
  private blockedIPs = new Set<string>();
  private suspiciousPatterns = new Map<string, number>();

  // Configuration
  private readonly config = {
    rateLimit: {
      maxConnectionsPerIP: 10,
      maxConnectionsPerDevice: 3,
      windowMs: 5 * 60 * 1000, // 5 minutes
      blockDurationMs: 15 * 60 * 1000 // 15 minutes
    },
    security: {
      maxFailedAttempts: 5,
      suspiciousThreshold: 3,
      requireUserAgent: true,
      allowedOrigins: ['https://localhost:3000', 'https://your-domain.com']
    }
  };

  constructor(private webSocketAuthService: WebSocketAuthService) {
    this.logger = new Logger('WebSocketAuthMiddleware');
    this.startCleanupTimer();
  }

  /**
   * Main authentication middleware function
   */
  authenticate() {
    return async (socket: AuthenticatedSocket, next: (err?: ExtendedError) => void) => {
      try {
        const clientIP = this.getClientIP(socket);
        const userAgent = socket.handshake.headers['user-agent'] || '';
        
        // Store client information
        socket.data.ipAddress = clientIP;
        socket.data.userAgent = userAgent;

        // Security checks
        const securityCheck = await this.performSecurityChecks(socket);
        if (!securityCheck.passed) {
          this.logger.warn('Security check failed', {
            socketId: socket.id,
            ip: clientIP,
            reason: securityCheck.reason
          });
          return next(new Error(securityCheck.reason));
        }

        // Rate limiting
        const rateLimitCheck = this.checkRateLimit(clientIP, socket.handshake.auth.deviceId);
        if (!rateLimitCheck.allowed) {
          this.logger.warn('Rate limit exceeded', {
            socketId: socket.id,
            ip: clientIP,
            reason: rateLimitCheck.reason
          });
          return next(new Error('Connection rate limit exceeded'));
        }

        // Authentication
        const authResult = await this.authenticateConnection(socket);
        if (!authResult.authenticated) {
          this.recordFailedAttempt(clientIP, socket.handshake.auth.deviceId);
          return next(new Error(authResult.error));
        }

        // Success - set socket data and proceed
        socket.data.authenticated = true;
        socket.data.deviceId = authResult.deviceId;
        socket.data.userId = authResult.userId;
        socket.data.capabilities = authResult.capabilities;

        this.logger.debug('WebSocket connection authenticated', {
          socketId: socket.id,
          deviceId: authResult.deviceId,
          userId: authResult.userId,
          ip: clientIP
        });

        next();
      } catch (error) {
        this.logger.error('Authentication middleware error:', error);
        next(new Error('Authentication failed'));
      }
    };
  }

  /**
   * Mobile-specific authentication middleware
   */
  authenticateMobile() {
    return async (socket: AuthenticatedSocket, next: (err?: ExtendedError) => void) => {
      try {
        const { sessionToken, deviceId } = socket.handshake.auth;

        if (!sessionToken || !deviceId) {
          return next(new Error('Missing required authentication parameters'));
        }

        // Validate mobile session
        const validation = await this.webSocketAuthService.validateMobileSession(sessionToken);

        if (!validation.valid) {
          this.recordFailedAttempt(this.getClientIP(socket), deviceId);
          return next(new Error(validation.error || 'Mobile authentication failed'));
        }

        // Verify device ID matches session
        if (validation.session?.deviceId !== deviceId) {
          this.logger.warn('Device ID mismatch', {
            sessionDevice: validation.session?.deviceId,
            providedDevice: deviceId,
            ip: this.getClientIP(socket)
          });
          return next(new Error('Device ID mismatch'));
        }

        // Set mobile-specific socket data
        socket.data.authenticated = true;
        socket.data.deviceId = deviceId;
        socket.data.userId = validation.session.userId;
        socket.data.capabilities = validation.session.capabilities;

        this.logger.info('Mobile device authenticated', {
          deviceId,
          userId: validation.session.userId,
          capabilities: validation.session.capabilities.join(', ')
        });

        next();
      } catch (error) {
        this.logger.error('Mobile authentication error:', error);
        next(new Error('Mobile authentication failed'));
      }
    };
  }

  /**
   * Capability-based authorization middleware
   */
  requireCapability(capability: string) {
    return (socket: AuthenticatedSocket, next: (err?: ExtendedError) => void) => {
      if (!socket.data.authenticated) {
        return next(new Error('Socket not authenticated'));
      }

      if (!socket.data.capabilities?.includes(capability)) {
        this.logger.warn('Insufficient capabilities', {
          socketId: socket.id,
          deviceId: socket.data.deviceId,
          required: capability,
          available: socket.data.capabilities
        });
        return next(new Error(`Missing required capability: ${capability}`));
      }

      next();
    };
  }

  /**
   * Security checks
   */
  private async performSecurityChecks(socket: AuthenticatedSocket): Promise<{
    passed: boolean;
    reason?: string;
  }> {
    const clientIP = this.getClientIP(socket);

    // Check blocked IPs
    if (this.blockedIPs.has(clientIP)) {
      return { passed: false, reason: 'IP address is blocked' };
    }

    // Check suspicious patterns
    if (this.suspiciousPatterns.has(clientIP)) {
      const count = this.suspiciousPatterns.get(clientIP)!;
      if (count >= this.config.security.suspiciousThreshold) {
        this.blockedIPs.add(clientIP);
        return { passed: false, reason: 'Suspicious activity detected' };
      }
    }

    // User agent validation
    if (this.config.security.requireUserAgent && !socket.handshake.headers['user-agent']) {
      return { passed: false, reason: 'User agent required' };
    }

    // Origin validation (if configured)
    const origin = socket.handshake.headers.origin;
    if (origin && this.config.security.allowedOrigins.length > 0) {
      if (!this.config.security.allowedOrigins.includes(origin)) {
        return { passed: false, reason: 'Origin not allowed' };
      }
    }

    return { passed: true };
  }

  /**
   * Rate limiting
   */
  private checkRateLimit(clientIP: string, deviceId?: string): {
    allowed: boolean;
    reason?: string;
  } {
    const now = Date.now();

    // IP-based rate limiting
    const ipKey = `ip:${clientIP}`;
    const ipLimit = this.getRateLimitEntry(ipKey, now);
    
    if (ipLimit.blocked) {
      return { allowed: false, reason: 'IP rate limit exceeded' };
    }

    if (ipLimit.count >= this.config.rateLimit.maxConnectionsPerIP) {
      ipLimit.blocked = true;
      return { allowed: false, reason: 'IP connection limit reached' };
    }

    // Device-based rate limiting
    if (deviceId) {
      const deviceKey = `device:${deviceId}`;
      const deviceLimit = this.getRateLimitEntry(deviceKey, now);
      
      if (deviceLimit.blocked) {
        return { allowed: false, reason: 'Device rate limit exceeded' };
      }

      if (deviceLimit.count >= this.config.rateLimit.maxConnectionsPerDevice) {
        deviceLimit.blocked = true;
        return { allowed: false, reason: 'Device connection limit reached' };
      }

      // Increment device counter
      deviceLimit.count++;
    }

    // Increment IP counter
    ipLimit.count++;

    return { allowed: true };
  }

  private getRateLimitEntry(key: string, now: number): RateLimitEntry {
    let entry = this.rateLimitCache.get(key);

    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + this.config.rateLimit.windowMs,
        blocked: false
      };
      this.rateLimitCache.set(key, entry);
    }

    // Unblock if block period has expired
    if (entry.blocked && now > entry.resetTime + this.config.rateLimit.blockDurationMs) {
      entry.blocked = false;
      entry.count = 0;
      entry.resetTime = now + this.config.rateLimit.windowMs;
    }

    return entry;
  }

  /**
   * Authentication
   */
  private async authenticateConnection(socket: AuthenticatedSocket): Promise<{
    authenticated: boolean;
    deviceId?: string;
    userId?: string;
    capabilities?: string[];
    error?: string;
  }> {
    const { sessionToken, deviceId } = socket.handshake.auth;

    if (!sessionToken) {
      return { authenticated: false, error: 'Session token required' };
    }

    try {
      const isValid = await this.webSocketAuthService.authenticateSocket(sessionToken, deviceId);
      
      if (!isValid) {
        return { authenticated: false, error: 'Invalid session token' };
      }

      // Get session details for socket data
      const validation = await this.webSocketAuthService.validateMobileSession(sessionToken);
      
      if (validation.valid && validation.session) {
        return {
          authenticated: true,
          deviceId: validation.session.deviceId,
          userId: validation.session.userId,
          capabilities: validation.session.capabilities
        };
      }

      return { authenticated: false, error: 'Session validation failed' };
    } catch (error) {
      this.logger.error('Authentication error:', error);
      return { authenticated: false, error: 'Authentication service error' };
    }
  }

  /**
   * Failure tracking
   */
  private recordFailedAttempt(clientIP: string, deviceId?: string): void {
    // Record suspicious patterns
    const current = this.suspiciousPatterns.get(clientIP) || 0;
    this.suspiciousPatterns.set(clientIP, current + 1);

    // Log failed attempt
    this.logger.warn('Authentication attempt failed', {
      ip: clientIP,
      deviceId,
      attempts: current + 1
    });
  }

  /**
   * Utility methods
   */
  private getClientIP(socket: Socket): string {
    return socket.handshake.headers['x-forwarded-for'] as string ||
           socket.handshake.headers['x-real-ip'] as string ||
           socket.handshake.address ||
           'unknown';
  }

  /**
   * Cleanup and maintenance
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60000); // Run every minute
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();

    // Clean rate limit cache
    for (const [key, entry] of this.rateLimitCache.entries()) {
      if (now > entry.resetTime + this.config.rateLimit.blockDurationMs) {
        this.rateLimitCache.delete(key);
      }
    }

    // Clean suspicious patterns (after 1 hour)
    const oneHourAgo = now - 3600000;
    for (const [ip, count] of this.suspiciousPatterns.entries()) {
      // This is simplified - in reality you'd track timestamps
      if (Math.random() < 0.1) { // Random cleanup for demo
        this.suspiciousPatterns.delete(ip);
      }
    }

    // Clean blocked IPs (after 24 hours)
    if (Math.random() < 0.01) { // Occasional cleanup for demo
      this.blockedIPs.clear();
    }
  }

  /**
   * Admin and monitoring methods
   */
  getStats(): {
    rateLimitEntries: number;
    blockedIPs: number;
    suspiciousPatterns: number;
  } {
    return {
      rateLimitEntries: this.rateLimitCache.size,
      blockedIPs: this.blockedIPs.size,
      suspiciousPatterns: this.suspiciousPatterns.size
    };
  }

  unblockIP(ip: string): boolean {
    return this.blockedIPs.delete(ip);
  }

  clearSuspiciousPattern(ip: string): boolean {
    return this.suspiciousPatterns.delete(ip);
  }

  updateConfig(newConfig: Partial<typeof this.config>): void {
    Object.assign(this.config, newConfig);
    this.logger.info('WebSocket auth middleware configuration updated');
  }
}
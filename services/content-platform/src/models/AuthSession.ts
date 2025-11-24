import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, BeforeInsert, BeforeUpdate } from 'typeorm';
import { User } from './User';

/**
 * Auth Session Entity
 * 
 * Represents active user sessions with JWT tokens
 * Tracks authentication state and session metadata
 * 
 * Single Responsibility: Session management and tracking
 * Open/Closed: Extensible for additional session properties
 * Liskov Substitution: Standard entity pattern
 * Interface Segregation: Focused on session concerns
 * Dependency Inversion: Uses standard ORM patterns
 */

@Entity('auth_sessions')
export class AuthSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 1000 })
  accessToken: string;

  @Column({ type: 'varchar', length: 1000 })
  refreshToken: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastUsedAt: Date;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => User, user => user.sessions, { onDelete: 'CASCADE' })
  user: User;

  @Column()
  userId: string;

  @BeforeInsert()
  @BeforeUpdate()
  updateLastUsed(): void {
    this.lastUsedAt = new Date();
  }

  /**
   * Check if session is expired
   */
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  /**
   * Check if session is valid (active and not expired)
   */
  isValid(): boolean {
    return this.isActive && !this.isExpired();
  }

  /**
   * Get session age in milliseconds
   */
  getAge(): number {
    return Date.now() - this.createdAt.getTime();
  }

  /**
   * Get time since last use in milliseconds
   */
  getTimeSinceLastUse(): number {
    return Date.now() - this.lastUsedAt.getTime();
  }

  /**
   * Get remaining time until expiration in milliseconds
   */
  getTimeUntilExpiration(): number {
    return this.expiresAt.getTime() - Date.now();
  }

  /**
   * Check if session is idle (not used for a while)
   */
  isIdle(idleTimeoutMs: number = 30 * 60 * 1000): boolean {
    return this.getTimeSinceLastUse() > idleTimeoutMs;
  }

  /**
   * Revoke session
   */
  revoke(): void {
    this.isActive = false;
  }

  /**
   * Extend session expiration
   */
  extend(extensionMs: number): void {
    this.expiresAt = new Date(this.expiresAt.getTime() + extensionMs);
  }

  /**
   * Update session activity
   */
  updateActivity(userAgent?: string, ipAddress?: string): void {
    this.lastUsedAt = new Date();
    
    if (userAgent) {
      this.userAgent = userAgent;
    }
    
    if (ipAddress) {
      this.ipAddress = ipAddress;
    }
  }

  /**
   * Get session device info from user agent
   */
  getDeviceInfo(): {
    browser: string;
    os: string;
    device: string;
    isMobile: boolean;
  } {
    if (!this.userAgent) {
      return {
        browser: 'Unknown',
        os: 'Unknown',
        device: 'Unknown',
        isMobile: false
      };
    }

    const ua = this.userAgent.toLowerCase();

    // Detect browser
    let browser = 'Unknown';
    if (ua.includes('chrome') && !ua.includes('edg')) {
      browser = 'Chrome';
    } else if (ua.includes('firefox')) {
      browser = 'Firefox';
    } else if (ua.includes('safari') && !ua.includes('chrome')) {
      browser = 'Safari';
    } else if (ua.includes('edg')) {
      browser = 'Edge';
    } else if (ua.includes('opera')) {
      browser = 'Opera';
    }

    // Detect OS
    let os = 'Unknown';
    if (ua.includes('windows')) {
      os = 'Windows';
    } else if (ua.includes('mac')) {
      os = 'macOS';
    } else if (ua.includes('linux')) {
      os = 'Linux';
    } else if (ua.includes('android')) {
      os = 'Android';
    } else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) {
      os = 'iOS';
    }

    // Detect device type
    const isMobile = ua.includes('mobile') || ua.includes('android') || ua.includes('iphone');
    let device = 'Desktop';
    if (isMobile) {
      device = ua.includes('tablet') || ua.includes('ipad') ? 'Tablet' : 'Mobile';
    }

    return { browser, os, device, isMobile };
  }

  /**
   * Get session location from IP address
   */
  async getLocationInfo(): Promise<{
    country: string;
    region: string;
    city: string;
    timezone: string;
  } | null> {
    if (!this.ipAddress || this.ipAddress === '127.0.0.1' || this.ipAddress === '::1') {
      return null;
    }

    // In a real implementation, you would use a geolocation service
    // This is a placeholder for the interface
    return {
      country: 'Unknown',
      region: 'Unknown',
      city: 'Unknown',
      timezone: 'Unknown'
    };
  }

  /**
   * Get session security level based on various factors
   */
  getSecurityLevel(): 'low' | 'medium' | 'high' {
    const deviceInfo = this.getDeviceInfo();
    const age = this.getAge();
    const timeSinceLastUse = this.getTimeSinceLastUse();

    let score = 0;

    // Base score for active session
    if (this.isValid()) score += 2;

    // Bonus for recent activity
    if (timeSinceLastUse < 5 * 60 * 1000) score += 2; // Last 5 minutes
    else if (timeSinceLastUse < 30 * 60 * 1000) score += 1; // Last 30 minutes

    // Penalty for old sessions
    if (age > 7 * 24 * 60 * 60 * 1000) score -= 2; // Older than 7 days
    else if (age > 24 * 60 * 60 * 1000) score -= 1; // Older than 1 day

    // Penalty for unknown device info
    if (deviceInfo.browser === 'Unknown') score -= 1;
    if (deviceInfo.os === 'Unknown') score -= 1;

    if (score >= 3) return 'high';
    if (score >= 1) return 'medium';
    return 'low';
  }

  /**
   * Convert to safe JSON (excluding sensitive tokens)
   */
  toSafeJSON(): Omit<AuthSession, 'accessToken' | 'refreshToken'> {
    const { accessToken, refreshToken, ...safeSession } = this;
    return {
      ...safeSession,
      deviceInfo: this.getDeviceInfo(),
      securityLevel: this.getSecurityLevel(),
      isExpired: this.isExpired(),
      isValid: this.isValid(),
      ageMs: this.getAge(),
      timeSinceLastUseMs: this.getTimeSinceLastUse(),
      timeUntilExpirationMs: this.getTimeUntilExpiration()
    };
  }

  /**
   * Generate session fingerprint for security
   */
  generateFingerprint(): string {
    const data = `${this.userId}:${this.userAgent}:${this.ipAddress}:${this.createdAt.getTime()}`;
    return require('crypto').createHash('sha256').update(data).digest('hex');
  }

  /**
   * Validate session against potential security threats
   */
  validateSecurity(): {
    valid: boolean;
    warnings: string[];
    risks: string[];
  } {
    const warnings: string[] = [];
    const risks: string[] = [];

    // Check for expired session
    if (this.isExpired()) {
      risks.push('Session has expired');
    }

    // Check for inactive session
    if (!this.isActive) {
      risks.push('Session has been revoked');
    }

    // Check for old sessions
    const age = this.getAge();
    if (age > 30 * 24 * 60 * 60 * 1000) { // 30 days
      risks.push('Session is very old (>30 days)');
    } else if (age > 7 * 24 * 60 * 60 * 1000) { // 7 days
      warnings.push('Session is old (>7 days)');
    }

    // Check for idle sessions
    const timeSinceLastUse = this.getTimeSinceLastUse();
    if (timeSinceLastUse > 24 * 60 * 60 * 1000) { // 24 hours
      warnings.push('Session has been idle for more than 24 hours');
    }

    // Check for suspicious IP changes (would need additional logic)
    if (!this.ipAddress) {
      warnings.push('No IP address recorded');
    }

    return {
      valid: risks.length === 0,
      warnings,
      risks
    };
  }

  /**
   * Create session expiration based on "remember me" option
   */
  static calculateExpiration(rememberMe: boolean = false): Date {
    const now = new Date();
    if (rememberMe) {
      // 30 days for remembered sessions
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    } else {
      // 24 hours for regular sessions
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }
  }
}
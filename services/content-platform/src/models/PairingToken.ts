import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { User } from './User';
import { DeviceInfo, PairingStatus } from '@/interfaces/IMobileAuthService';

/**
 * Pairing Token Entity
 * 
 * Represents a temporary token used for mobile device pairing. Implements secure
 * token generation, expiration handling, and usage tracking for device authentication.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility: Manages pairing token lifecycle and validation
 * - Open/Closed: Extensible for new security features and token types
 * - Liskov Substitution: Can be used wherever token validation is required
 * - Interface Segregation: Focused on token-specific operations
 * - Dependency Inversion: Uses abstractions for external dependencies
 * 
 * Security Features:
 * - Time-based expiration
 * - Single-use enforcement
 * - Rate limiting support
 * - Audit trail tracking
 * - Case-insensitive code matching
 */

@Entity('pairing_tokens')
@Index(['code'], { unique: true })
@Index(['userId', 'isUsed', 'expiresAt'])
@Index(['createdAt', 'isUsed'])
export class PairingToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ length: 10, unique: true })
  code!: string;

  @Column({ name: 'pairing_token', length: 255 })
  token!: string;

  @Column({ type: 'json' })
  deviceInfo!: DeviceInfo;

  @Column({ name: 'expires_at' })
  expiresAt!: Date;

  @Column({ name: 'is_used', default: false })
  isUsed!: boolean;

  @Column({ name: 'used_at', nullable: true })
  usedAt?: Date;

  @Column({ name: 'source_ip', nullable: true })
  sourceIP?: string;

  @Column({ name: 'user_agent', nullable: true })
  userAgent?: string;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  // Security and tracking fields
  @Column({ name: 'attempts', default: 0 })
  attempts!: number;

  @Column({ name: 'last_attempt', nullable: true })
  lastAttempt?: Date;

  @Column({ type: 'enum', enum: PairingStatus, default: PairingStatus.INITIATED })
  status!: PairingStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  // Static factory methods (SOLID: Single Responsibility)
  static createPairingToken(
    userId: string,
    code: string,
    token: string,
    deviceInfo: DeviceInfo,
    expiryMinutes: number = 5,
    sourceIP?: string,
    userAgent?: string
  ): PairingToken {
    const pairingToken = new PairingToken();
    pairingToken.userId = userId;
    pairingToken.code = code.toUpperCase(); // Normalize to uppercase for case-insensitive matching
    pairingToken.token = token;
    pairingToken.deviceInfo = deviceInfo;
    pairingToken.expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
    pairingToken.isUsed = false;
    pairingToken.attempts = 0;
    pairingToken.status = PairingStatus.INITIATED;
    pairingToken.sourceIP = sourceIP;
    pairingToken.userAgent = userAgent;
    pairingToken.metadata = {
      deviceName: deviceInfo.name,
      deviceOS: deviceInfo.os,
      creationTimestamp: new Date().toISOString()
    };
    return pairingToken;
  }

  // Token validation and lifecycle methods
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  canBeUsed(): boolean {
    return !this.isUsed && 
           !this.isExpired() && 
           this.status === PairingStatus.INITIATED;
  }

  markAsUsed(deviceId?: string): void {
    if (this.isUsed) {
      throw new Error('Pairing token has already been used');
    }

    if (this.isExpired()) {
      throw new Error('Cannot use expired pairing token');
    }

    this.isUsed = true;
    this.usedAt = new Date();
    this.status = PairingStatus.COMPLETED;
    
    if (deviceId && this.metadata) {
      this.metadata.deviceId = deviceId;
      this.metadata.completedAt = new Date().toISOString();
    }
  }

  markAsExpired(): void {
    if (this.status === PairingStatus.INITIATED) {
      this.status = PairingStatus.EXPIRED;
      if (this.metadata) {
        this.metadata.expiredAt = new Date().toISOString();
        this.metadata.expiredReason = 'Time-based expiration';
      }
    }
  }

  recordAttempt(sourceIP?: string): void {
    this.attempts += 1;
    this.lastAttempt = new Date();
    
    if (sourceIP && this.metadata) {
      if (!this.metadata.attemptIPs) {
        this.metadata.attemptIPs = [];
      }
      this.metadata.attemptIPs.push({
        ip: sourceIP,
        timestamp: new Date().toISOString()
      });
    }

    // Mark as suspicious if too many attempts
    if (this.attempts >= 3 && this.status === PairingStatus.INITIATED) {
      this.status = PairingStatus.SUSPICIOUS;
      if (this.metadata) {
        this.metadata.suspiciousReason = 'Too many validation attempts';
      }
    }
  }

  // Security and validation methods
  validateCode(inputCode: string): boolean {
    // Case-insensitive comparison
    const normalizedInput = inputCode.toUpperCase().trim();
    const normalizedCode = this.code.toUpperCase();
    
    return normalizedInput === normalizedCode;
  }

  isSuspicious(): boolean {
    return this.status === PairingStatus.SUSPICIOUS || 
           this.attempts > 3 ||
           (this.lastAttempt && 
            Date.now() - this.lastAttempt.getTime() < 1000); // Too frequent attempts
  }

  getTimeUntilExpiry(): number {
    const now = Date.now();
    const expiry = this.expiresAt.getTime();
    return Math.max(0, expiry - now);
  }

  // Device compatibility checking
  isDeviceCompatible(deviceInfo: DeviceInfo): boolean {
    // Check if the provided device info matches the original request
    return this.deviceInfo.os === deviceInfo.os &&
           this.deviceInfo.appVersion === deviceInfo.appVersion &&
           this.deviceInfo.capabilities.every(cap => 
             deviceInfo.capabilities.includes(cap)
           );
  }

  // Risk assessment
  calculateRiskScore(): number {
    let riskScore = 0;

    // Base risk factors
    if (this.attempts > 1) riskScore += 0.3;
    if (this.attempts > 3) riskScore += 0.5;
    
    // Time-based risk
    const ageMinutes = (Date.now() - this.createdAt.getTime()) / (1000 * 60);
    if (ageMinutes > 30) riskScore += 0.2; // Old tokens are riskier
    
    // Expiration proximity
    const timeUntilExpiry = this.getTimeUntilExpiry();
    if (timeUntilExpiry < 60000) riskScore += 0.1; // Last minute usage
    
    // Suspicious status
    if (this.status === PairingStatus.SUSPICIOUS) riskScore += 0.4;
    
    // Multiple IP attempts
    if (this.metadata?.attemptIPs && this.metadata.attemptIPs.length > 1) {
      const uniqueIPs = new Set(this.metadata.attemptIPs.map((attempt: any) => attempt.ip));
      if (uniqueIPs.size > 1) riskScore += 0.6; // Multiple IPs is very suspicious
    }

    return Math.min(1.0, riskScore);
  }

  // Static utility methods
  static generateSecureCode(length: number = 6): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude similar-looking chars
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  static isValidCodeFormat(code: string): boolean {
    // 6 alphanumeric characters, no special chars
    return /^[A-Z0-9]{6}$/.test(code.toUpperCase());
  }

  // Audit and logging helpers
  createAuditLog(): any {
    return {
      tokenId: this.id,
      userId: this.userId,
      code: this.code.substring(0, 3) + '***', // Partially masked for security
      action: 'token_used',
      deviceInfo: {
        name: this.deviceInfo.name,
        os: this.deviceInfo.os,
        capabilities: this.deviceInfo.capabilities
      },
      attempts: this.attempts,
      riskScore: this.calculateRiskScore(),
      timestamp: new Date(),
      sourceIP: this.sourceIP,
      metadata: this.metadata
    };
  }

  // JSON serialization (Interface Segregation)
  toSafeJSON(): any {
    return {
      id: this.id,
      userId: this.userId,
      code: this.code.substring(0, 3) + '***', // Partially masked
      expiresAt: this.expiresAt,
      isUsed: this.isUsed,
      usedAt: this.usedAt,
      attempts: this.attempts,
      status: this.status,
      deviceInfo: {
        name: this.deviceInfo.name,
        os: this.deviceInfo.os,
        model: this.deviceInfo.model,
        capabilities: this.deviceInfo.capabilities
      },
      timeUntilExpiry: this.getTimeUntilExpiry(),
      riskScore: this.calculateRiskScore(),
      createdAt: this.createdAt
    };
  }

  toSecureJSON(): any {
    // Version with minimal information for external APIs
    return {
      id: this.id,
      expiresAt: this.expiresAt,
      isUsed: this.isUsed,
      status: this.status,
      timeUntilExpiry: this.getTimeUntilExpiry()
    };
  }

  // Validation methods for business logic
  static validateDeviceInfo(deviceInfo: DeviceInfo): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!deviceInfo.name || deviceInfo.name.trim().length === 0) {
      errors.push('Device name is required');
    }

    if (!deviceInfo.model || deviceInfo.model.trim().length === 0) {
      errors.push('Device model is required');
    }

    if (!['iOS', 'Android', 'Other'].includes(deviceInfo.os)) {
      errors.push('Invalid operating system');
    }

    if (!deviceInfo.osVersion || deviceInfo.osVersion.trim().length === 0) {
      errors.push('OS version is required');
    }

    if (!deviceInfo.appVersion || deviceInfo.appVersion.trim().length === 0) {
      errors.push('App version is required');
    }

    if (!Array.isArray(deviceInfo.capabilities) || deviceInfo.capabilities.length === 0) {
      errors.push('At least one capability is required');
    }

    // Validate device name length and characters
    if (deviceInfo.name && deviceInfo.name.length > 100) {
      errors.push('Device name must be less than 100 characters');
    }

    if (deviceInfo.name && !/^[a-zA-Z0-9\s\-_']+$/.test(deviceInfo.name)) {
      errors.push('Device name contains invalid characters');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Cleanup and maintenance
  static getExpiredTokensQuery(): string {
    return `
      SELECT id FROM pairing_tokens 
      WHERE expires_at < NOW() 
      AND status != 'expired'
      ORDER BY expires_at ASC
    `;
  }

  static getOldTokensQuery(days: number = 7): string {
    return `
      SELECT id FROM pairing_tokens 
      WHERE created_at < NOW() - INTERVAL ${days} DAY
      AND (is_used = true OR status = 'expired')
      ORDER BY created_at ASC
    `;
  }
}
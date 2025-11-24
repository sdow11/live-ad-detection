import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { MobileDevice } from './MobileDevice';
import { User } from './User';
import { DeviceCapability } from '@/interfaces/IMobileRemoteService';

/**
 * Remote Session Entity
 * 
 * Represents an active session between a mobile device and the platform.
 * Manages authentication tokens, session expiry, and activity tracking
 * for secure remote control operations.
 * 
 * Features:
 * - Session token management
 * - Activity tracking and timeout
 * - Capability-based access control
 * - Session metadata and analytics
 */

@Entity('remote_sessions')
@Index(['sessionToken'], { unique: true })
@Index(['deviceId', 'isActive'])
@Index(['userId', 'isActive'])
export class RemoteSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'device_id' })
  deviceId!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'session_token', unique: true })
  sessionToken!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'expires_at' })
  expiresAt!: Date;

  @Column({ name: 'last_activity' })
  lastActivity!: Date;

  @Column({ type: 'json' })
  capabilities!: DeviceCapability[];

  @Column({ name: 'ip_address', nullable: true })
  ipAddress?: string;

  @Column({ name: 'user_agent', nullable: true })
  userAgent?: string;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  // Session statistics
  @Column({ name: 'commands_executed', default: 0 })
  commandsExecuted!: number;

  @Column({ name: 'total_duration', default: 0 }) // in seconds
  totalDuration!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => MobileDevice)
  @JoinColumn({ name: 'device_id' })
  device!: MobileDevice;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  // Static factory methods
  static createForDevice(
    deviceId: string, 
    userId: string, 
    sessionToken: string, 
    capabilities: DeviceCapability[],
    durationMinutes: number = 60
  ): RemoteSession {
    const session = new RemoteSession();
    session.deviceId = deviceId;
    session.userId = userId;
    session.sessionToken = sessionToken;
    session.capabilities = capabilities;
    session.isActive = true;
    session.lastActivity = new Date();
    session.expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    session.commandsExecuted = 0;
    session.totalDuration = 0;
    return session;
  }

  // Session management methods
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  isStale(maxInactiveMinutes: number = 30): boolean {
    const threshold = new Date(Date.now() - maxInactiveMinutes * 60 * 1000);
    return this.lastActivity < threshold;
  }

  shouldExpire(): boolean {
    return this.isExpired() || this.isStale();
  }

  updateActivity(): void {
    this.lastActivity = new Date();
    this.calculateDuration();
  }

  expire(reason?: string): void {
    this.isActive = false;
    this.calculateDuration();
    
    if (reason && this.metadata) {
      this.metadata.expiredReason = reason;
    } else if (reason) {
      this.metadata = { expiredReason: reason };
    }
  }

  extend(additionalMinutes: number): void {
    if (this.isActive && !this.isExpired()) {
      this.expiresAt = new Date(this.expiresAt.getTime() + additionalMinutes * 60 * 1000);
      this.updateActivity();
    }
  }

  refresh(newExpiryMinutes: number = 60): void {
    if (this.isActive) {
      this.expiresAt = new Date(Date.now() + newExpiryMinutes * 60 * 1000);
      this.updateActivity();
    }
  }

  // Capability and permission methods
  hasCapability(capability: DeviceCapability): boolean {
    return this.isActive && !this.shouldExpire() && this.capabilities.includes(capability);
  }

  canExecuteCommand(requiredCapability: DeviceCapability): boolean {
    return this.hasCapability(requiredCapability) && this.isValidForCommands();
  }

  isValidForCommands(): boolean {
    return this.isActive && !this.shouldExpire();
  }

  // Command tracking
  recordCommandExecution(): void {
    this.commandsExecuted += 1;
    this.updateActivity();
  }

  // Session analytics
  private calculateDuration(): void {
    const now = new Date();
    const duration = Math.floor((now.getTime() - this.createdAt.getTime()) / 1000);
    this.totalDuration = duration;
  }

  getDurationMinutes(): number {
    this.calculateDuration();
    return Math.floor(this.totalDuration / 60);
  }

  getCommandsPerMinute(): number {
    const minutes = this.getDurationMinutes();
    return minutes > 0 ? this.commandsExecuted / minutes : 0;
  }

  // Security methods
  validateForCommand(
    requiredCapability: DeviceCapability, 
    ipAddress?: string, 
    userAgent?: string
  ): { valid: boolean; reason?: string } {
    if (!this.isActive) {
      return { valid: false, reason: 'Session is not active' };
    }

    if (this.isExpired()) {
      return { valid: false, reason: 'Session has expired' };
    }

    if (this.isStale()) {
      return { valid: false, reason: 'Session is stale due to inactivity' };
    }

    if (!this.hasCapability(requiredCapability)) {
      return { valid: false, reason: `Missing required capability: ${requiredCapability}` };
    }

    // Optional IP validation (if configured)
    if (this.ipAddress && ipAddress && this.ipAddress !== ipAddress) {
      return { valid: false, reason: 'IP address mismatch' };
    }

    return { valid: true };
  }

  // Rate limiting helpers
  isRateLimited(commandsPerMinute: number = 60): boolean {
    return this.getCommandsPerMinute() > commandsPerMinute;
  }

  // Validation methods
  static validateSessionToken(token: string): boolean {
    // Basic token format validation
    return typeof token === 'string' && 
           token.length >= 32 && 
           /^[A-Za-z0-9\-_.~+/]+=*$/.test(token);
  }

  // JSON serialization
  toSafeJSON(): any {
    return {
      id: this.id,
      deviceId: this.deviceId,
      userId: this.userId,
      isActive: this.isActive,
      expiresAt: this.expiresAt,
      lastActivity: this.lastActivity,
      capabilities: this.capabilities,
      commandsExecuted: this.commandsExecuted,
      durationMinutes: this.getDurationMinutes(),
      commandsPerMinute: this.getCommandsPerMinute(),
      createdAt: this.createdAt,
      isExpired: this.isExpired(),
      isStale: this.isStale(),
      metadata: this.metadata
    };
  }

  toSecureJSON(): any {
    // Version without sensitive information
    return {
      id: this.id,
      isActive: this.isActive,
      expiresAt: this.expiresAt,
      lastActivity: this.lastActivity,
      capabilities: this.capabilities,
      durationMinutes: this.getDurationMinutes(),
      isExpired: this.isExpired()
    };
  }

  // Cleanup and maintenance
  static getExpiredSessionsQuery() {
    return `
      SELECT id FROM remote_sessions 
      WHERE is_active = true 
      AND (expires_at < NOW() OR last_activity < NOW() - INTERVAL 30 MINUTE)
    `;
  }

  // Audit trail
  createAuditLog(): any {
    return {
      sessionId: this.id,
      deviceId: this.deviceId,
      userId: this.userId,
      action: this.isActive ? 'session_active' : 'session_expired',
      duration: this.getDurationMinutes(),
      commandsExecuted: this.commandsExecuted,
      timestamp: new Date(),
      capabilities: this.capabilities,
      ipAddress: this.ipAddress,
      userAgent: this.userAgent
    };
  }
}
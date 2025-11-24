import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, BeforeInsert, BeforeUpdate } from 'typeorm';
import bcrypt from 'bcrypt';
import { UserRole } from './UserRole';
import { AuthSession } from './AuthSession';

/**
 * User Entity
 * 
 * Represents a system user with authentication and profile information
 * Includes password hashing, email validation, and role-based access control
 * 
 * Single Responsibility: User data management and authentication
 * Open/Closed: Extensible for additional user properties
 * Liskov Substitution: Standard entity pattern
 * Interface Segregation: Focused on user concerns
 * Dependency Inversion: Uses injected services for operations
 */

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 255 })
  email: string;

  @Column({ unique: true, length: 100 })
  username: string;

  @Column({ length: 255 })
  passwordHash: string;

  @Column({ length: 100 })
  firstName: string;

  @Column({ length: 100 })
  lastName: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  emailVerificationToken: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  passwordResetToken: string | null;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetExpiresAt: Date | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => UserRole, role => role.users, { eager: true })
  role: UserRole;

  @OneToMany(() => AuthSession, session => session.user)
  sessions: AuthSession[];

  // Password handling
  private tempPassword?: string;

  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword(): Promise<void> {
    if (this.tempPassword) {
      const saltRounds = 12;
      this.passwordHash = await bcrypt.hash(this.tempPassword, saltRounds);
      this.tempPassword = undefined;
    }
  }

  /**
   * Set password (will be hashed before save)
   */
  setPassword(password: string): void {
    this.tempPassword = password;
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.passwordHash);
  }

  /**
   * Get full name
   */
  getFullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  /**
   * Get display name (preferring full name, falling back to username)
   */
  getDisplayName(): string {
    const fullName = this.getFullName();
    return fullName || this.username;
  }

  /**
   * Check if user has specific permission
   */
  hasPermission(resource: string, action: string): boolean {
    if (!this.role || !this.role.permissions) {
      return false;
    }

    return this.role.permissions.some(permission => 
      permission.resource === resource && permission.action === action
    );
  }

  /**
   * Check if user has any permission for a resource
   */
  hasResourceAccess(resource: string): boolean {
    if (!this.role || !this.role.permissions) {
      return false;
    }

    return this.role.permissions.some(permission => 
      permission.resource === resource
    );
  }

  /**
   * Get user's permissions
   */
  getPermissions(): string[] {
    if (!this.role || !this.role.permissions) {
      return [];
    }

    return this.role.permissions.map(p => `${p.resource}:${p.action}`);
  }

  /**
   * Check if user can access admin features
   */
  isAdmin(): boolean {
    return this.role && (this.role.name === 'admin' || this.role.name === 'super_admin');
  }

  /**
   * Check if user can manage content
   */
  canManageContent(): boolean {
    return this.hasPermission('content', 'create') || 
           this.hasPermission('content', 'update') || 
           this.hasPermission('content', 'delete');
  }

  /**
   * Check if user can manage schedules
   */
  canManageSchedules(): boolean {
    return this.hasPermission('schedule', 'create') || 
           this.hasPermission('schedule', 'update') || 
           this.hasPermission('schedule', 'delete');
  }

  /**
   * Check if user can view analytics
   */
  canViewAnalytics(): boolean {
    return this.hasPermission('analytics', 'read');
  }

  /**
   * Generate email verification token
   */
  generateEmailVerificationToken(): string {
    this.emailVerificationToken = this.generateSecureToken();
    return this.emailVerificationToken;
  }

  /**
   * Generate password reset token
   */
  generatePasswordResetToken(): string {
    this.passwordResetToken = this.generateSecureToken();
    this.passwordResetExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    return this.passwordResetToken;
  }

  /**
   * Verify email verification token
   */
  verifyEmailVerificationToken(token: string): boolean {
    if (!this.emailVerificationToken || this.emailVerified) {
      return false;
    }

    if (this.emailVerificationToken === token) {
      this.emailVerified = true;
      this.emailVerifiedAt = new Date();
      this.emailVerificationToken = null;
      return true;
    }

    return false;
  }

  /**
   * Verify password reset token
   */
  verifyPasswordResetToken(token: string): boolean {
    if (!this.passwordResetToken || !this.passwordResetExpiresAt) {
      return false;
    }

    if (new Date() > this.passwordResetExpiresAt) {
      // Token expired
      this.passwordResetToken = null;
      this.passwordResetExpiresAt = null;
      return false;
    }

    return this.passwordResetToken === token;
  }

  /**
   * Clear password reset token
   */
  clearPasswordResetToken(): void {
    this.passwordResetToken = null;
    this.passwordResetExpiresAt = null;
  }

  /**
   * Update last login timestamp
   */
  updateLastLogin(): void {
    this.lastLoginAt = new Date();
  }

  /**
   * Get user status
   */
  getStatus(): 'active' | 'inactive' | 'unverified' {
    if (!this.isActive) return 'inactive';
    if (!this.emailVerified) return 'unverified';
    return 'active';
  }

  /**
   * Convert to safe JSON (excluding sensitive data)
   */
  toSafeJSON(): Omit<User, 'passwordHash' | 'passwordResetToken' | 'emailVerificationToken'> {
    const { passwordHash, passwordResetToken, emailVerificationToken, ...safeUser } = this;
    return safeUser;
  }

  /**
   * Generate secure random token
   */
  private generateSecureToken(): string {
    return require('crypto').randomBytes(32).toString('hex');
  }

  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate password strength
   */
  static isValidPassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate username format
   */
  static isValidUsername(username: string): boolean {
    const usernameRegex = /^[a-zA-Z0-9_-]{3,30}$/;
    return usernameRegex.test(username);
  }
}
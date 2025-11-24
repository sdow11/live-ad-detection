import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToMany, JoinTable } from 'typeorm';
import { User } from './User';
import { Permission } from './Permission';

/**
 * User Role Entity
 * 
 * Represents user roles for role-based access control (RBAC)
 * Defines permission sets that can be assigned to users
 * 
 * Single Responsibility: Role management and permission grouping
 * Open/Closed: Extensible for new role types
 * Liskov Substitution: Standard entity pattern
 * Interface Segregation: Focused on role concerns
 * Dependency Inversion: Uses standard ORM patterns
 */

@Entity('user_roles')
export class UserRole {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 100 })
  name: string;

  @Column({ length: 255, nullable: true })
  description: string | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isSystem: boolean; // System roles cannot be deleted

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @OneToMany(() => User, user => user.role)
  users: User[];

  @ManyToMany(() => Permission, permission => permission.roles, { eager: true })
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' }
  })
  permissions: Permission[];

  /**
   * Check if role has specific permission
   */
  hasPermission(resource: string, action: string): boolean {
    if (!this.permissions) {
      return false;
    }

    return this.permissions.some(permission => 
      permission.resource === resource && permission.action === action
    );
  }

  /**
   * Check if role has any permission for a resource
   */
  hasResourceAccess(resource: string): boolean {
    if (!this.permissions) {
      return false;
    }

    return this.permissions.some(permission => 
      permission.resource === resource
    );
  }

  /**
   * Get all permission strings
   */
  getPermissionStrings(): string[] {
    if (!this.permissions) {
      return [];
    }

    return this.permissions.map(p => `${p.resource}:${p.action}`);
  }

  /**
   * Get permissions grouped by resource
   */
  getPermissionsByResource(): Record<string, string[]> {
    if (!this.permissions) {
      return {};
    }

    const grouped: Record<string, string[]> = {};
    
    for (const permission of this.permissions) {
      if (!grouped[permission.resource]) {
        grouped[permission.resource] = [];
      }
      grouped[permission.resource].push(permission.action);
    }

    return grouped;
  }

  /**
   * Add permission to role
   */
  addPermission(permission: Permission): void {
    if (!this.permissions) {
      this.permissions = [];
    }

    // Check if permission already exists
    const exists = this.permissions.some(p => p.id === permission.id);
    if (!exists) {
      this.permissions.push(permission);
    }
  }

  /**
   * Remove permission from role
   */
  removePermission(permissionId: string): boolean {
    if (!this.permissions) {
      return false;
    }

    const initialLength = this.permissions.length;
    this.permissions = this.permissions.filter(p => p.id !== permissionId);
    
    return this.permissions.length < initialLength;
  }

  /**
   * Get user count for this role
   */
  getUserCount(): number {
    return this.users ? this.users.length : 0;
  }

  /**
   * Check if role is admin-level
   */
  isAdminRole(): boolean {
    return this.name === 'admin' || this.name === 'super_admin';
  }

  /**
   * Check if role can be deleted
   */
  canBeDeleted(): boolean {
    return !this.isSystem && this.getUserCount() === 0;
  }

  /**
   * Get role display name
   */
  getDisplayName(): string {
    return this.name.split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Validate role name format
   */
  static isValidRoleName(name: string): boolean {
    const roleNameRegex = /^[a-z_]{2,50}$/;
    return roleNameRegex.test(name);
  }

  /**
   * Get default user role
   */
  static getDefaultRoleName(): string {
    return 'user';
  }

  /**
   * Get system roles that should always exist
   */
  static getSystemRoles(): Array<{ name: string; description: string; permissions: string[] }> {
    return [
      {
        name: 'super_admin',
        description: 'Super administrator with full system access',
        permissions: [
          'user:*', 'role:*', 'permission:*', 'content:*', 'schedule:*', 
          'analytics:*', 'system:*', 'pip:*', 'notification:*'
        ]
      },
      {
        name: 'admin',
        description: 'Administrator with management access',
        permissions: [
          'user:read', 'user:update', 'content:*', 'schedule:*', 
          'analytics:read', 'pip:*', 'notification:read'
        ]
      },
      {
        name: 'content_manager',
        description: 'Content management and scheduling',
        permissions: [
          'content:*', 'schedule:*', 'analytics:read', 'pip:read'
        ]
      },
      {
        name: 'viewer',
        description: 'Read-only access to content and analytics',
        permissions: [
          'content:read', 'schedule:read', 'analytics:read', 'pip:read'
        ]
      },
      {
        name: 'user',
        description: 'Basic user with limited access',
        permissions: [
          'content:read', 'schedule:read', 'pip:read'
        ]
      }
    ];
  }
}
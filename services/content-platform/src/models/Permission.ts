import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToMany } from 'typeorm';
import { UserRole } from './UserRole';

/**
 * Permission Entity
 * 
 * Represents individual permissions for role-based access control
 * Defines granular access rights for different resources and actions
 * 
 * Single Responsibility: Permission definition and management
 * Open/Closed: Extensible for new permissions
 * Liskov Substitution: Standard entity pattern
 * Interface Segregation: Focused on permission concerns
 * Dependency Inversion: Uses standard ORM patterns
 */

@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 100 })
  name: string;

  @Column({ length: 100 })
  resource: string;

  @Column({ length: 100 })
  action: string;

  @Column({ length: 255, nullable: true })
  description: string | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isSystem: boolean; // System permissions cannot be deleted

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToMany(() => UserRole, role => role.permissions)
  roles: UserRole[];

  /**
   * Get permission identifier string
   */
  getPermissionString(): string {
    return `${this.resource}:${this.action}`;
  }

  /**
   * Get permission display name
   */
  getDisplayName(): string {
    if (this.name) {
      return this.name.split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
    
    return `${this.action.charAt(0).toUpperCase() + this.action.slice(1)} ${this.resource}`;
  }

  /**
   * Check if permission can be deleted
   */
  canBeDeleted(): boolean {
    return !this.isSystem && (!this.roles || this.roles.length === 0);
  }

  /**
   * Check if permission is wildcard (allows all actions)
   */
  isWildcard(): boolean {
    return this.action === '*';
  }

  /**
   * Check if permission matches a specific resource and action
   */
  matches(resource: string, action: string): boolean {
    const resourceMatch = this.resource === resource || this.resource === '*';
    const actionMatch = this.action === action || this.action === '*';
    
    return resourceMatch && actionMatch;
  }

  /**
   * Validate permission name format
   */
  static isValidPermissionName(name: string): boolean {
    const nameRegex = /^[a-z_]{2,100}$/;
    return nameRegex.test(name);
  }

  /**
   * Validate resource name format
   */
  static isValidResource(resource: string): boolean {
    const resourceRegex = /^[a-z_]{2,50}$/;
    return resourceRegex.test(resource);
  }

  /**
   * Validate action name format
   */
  static isValidAction(action: string): boolean {
    const actionRegex = /^(\*|[a-z_]{2,50})$/;
    return actionRegex.test(action);
  }

  /**
   * Parse permission string (resource:action)
   */
  static parsePermissionString(permissionString: string): { resource: string; action: string } | null {
    const parts = permissionString.split(':');
    if (parts.length !== 2) {
      return null;
    }

    const [resource, action] = parts;
    if (!this.isValidResource(resource) || !this.isValidAction(action)) {
      return null;
    }

    return { resource, action };
  }

  /**
   * Get default system permissions
   */
  static getSystemPermissions(): Array<{
    name: string;
    resource: string;
    action: string;
    description: string;
  }> {
    return [
      // User management permissions
      { name: 'create_user', resource: 'user', action: 'create', description: 'Create new users' },
      { name: 'read_user', resource: 'user', action: 'read', description: 'View user information' },
      { name: 'update_user', resource: 'user', action: 'update', description: 'Update user information' },
      { name: 'delete_user', resource: 'user', action: 'delete', description: 'Delete users' },
      { name: 'manage_users', resource: 'user', action: '*', description: 'Full user management access' },

      // Role management permissions
      { name: 'create_role', resource: 'role', action: 'create', description: 'Create new roles' },
      { name: 'read_role', resource: 'role', action: 'read', description: 'View role information' },
      { name: 'update_role', resource: 'role', action: 'update', description: 'Update role information' },
      { name: 'delete_role', resource: 'role', action: 'delete', description: 'Delete roles' },
      { name: 'manage_roles', resource: 'role', action: '*', description: 'Full role management access' },

      // Permission management permissions
      { name: 'create_permission', resource: 'permission', action: 'create', description: 'Create new permissions' },
      { name: 'read_permission', resource: 'permission', action: 'read', description: 'View permission information' },
      { name: 'update_permission', resource: 'permission', action: 'update', description: 'Update permission information' },
      { name: 'delete_permission', resource: 'permission', action: 'delete', description: 'Delete permissions' },
      { name: 'manage_permissions', resource: 'permission', action: '*', description: 'Full permission management access' },

      // Content management permissions
      { name: 'create_content', resource: 'content', action: 'create', description: 'Upload and create content' },
      { name: 'read_content', resource: 'content', action: 'read', description: 'View content' },
      { name: 'update_content', resource: 'content', action: 'update', description: 'Update content information' },
      { name: 'delete_content', resource: 'content', action: 'delete', description: 'Delete content' },
      { name: 'manage_content', resource: 'content', action: '*', description: 'Full content management access' },

      // Schedule management permissions
      { name: 'create_schedule', resource: 'schedule', action: 'create', description: 'Create new schedules' },
      { name: 'read_schedule', resource: 'schedule', action: 'read', description: 'View schedule information' },
      { name: 'update_schedule', resource: 'schedule', action: 'update', description: 'Update schedule information' },
      { name: 'delete_schedule', resource: 'schedule', action: 'delete', description: 'Delete schedules' },
      { name: 'execute_schedule', resource: 'schedule', action: 'execute', description: 'Execute schedules manually' },
      { name: 'manage_schedules', resource: 'schedule', action: '*', description: 'Full schedule management access' },

      // Analytics permissions
      { name: 'read_analytics', resource: 'analytics', action: 'read', description: 'View analytics and reports' },
      { name: 'export_analytics', resource: 'analytics', action: 'export', description: 'Export analytics data' },
      { name: 'manage_analytics', resource: 'analytics', action: '*', description: 'Full analytics access' },

      // Picture-in-Picture permissions
      { name: 'read_pip', resource: 'pip', action: 'read', description: 'View PiP sessions' },
      { name: 'create_pip', resource: 'pip', action: 'create', description: 'Create PiP sessions' },
      { name: 'update_pip', resource: 'pip', action: 'update', description: 'Update PiP sessions' },
      { name: 'delete_pip', resource: 'pip', action: 'delete', description: 'End PiP sessions' },
      { name: 'manage_pip', resource: 'pip', action: '*', description: 'Full PiP management access' },

      // Notification permissions
      { name: 'read_notification', resource: 'notification', action: 'read', description: 'View notifications' },
      { name: 'send_notification', resource: 'notification', action: 'send', description: 'Send notifications' },
      { name: 'manage_notifications', resource: 'notification', action: '*', description: 'Full notification management access' },

      // System permissions
      { name: 'read_system', resource: 'system', action: 'read', description: 'View system information' },
      { name: 'update_system', resource: 'system', action: 'update', description: 'Update system settings' },
      { name: 'manage_system', resource: 'system', action: '*', description: 'Full system management access' },

      // Wildcard permission for super admin
      { name: 'super_admin_access', resource: '*', action: '*', description: 'Full system access (super admin only)' }
    ];
  }

  /**
   * Get permissions by resource
   */
  static getPermissionsByResource(resource: string): string[] {
    const allPermissions = this.getSystemPermissions();
    return allPermissions
      .filter(p => p.resource === resource || p.resource === '*')
      .map(p => p.action);
  }

  /**
   * Get all available resources
   */
  static getAvailableResources(): string[] {
    const allPermissions = this.getSystemPermissions();
    const resources = new Set(allPermissions.map(p => p.resource));
    resources.delete('*'); // Remove wildcard from list
    return Array.from(resources).sort();
  }

  /**
   * Get all available actions
   */
  static getAvailableActions(): string[] {
    const allPermissions = this.getSystemPermissions();
    const actions = new Set(allPermissions.map(p => p.action));
    actions.delete('*'); // Remove wildcard from list
    return Array.from(actions).sort();
  }
}
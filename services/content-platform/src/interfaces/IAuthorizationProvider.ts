import { User } from './IAuthProvider';

/**
 * Authorization Provider Interface
 * 
 * Role-Based Access Control (RBAC) interface for enterprise security.
 * Supports fine-grained permissions, role hierarchies, and resource-level access control.
 * 
 * Design Principles:
 * - Single Responsibility: Authorization and permission management only
 * - Strategy Pattern: Pluggable authorization implementations
 * - Interface Segregation: Separate from authentication concerns
 * - Open/Closed: Extensible for new permission models
 */

export interface IAuthorizationProvider {
  // Permission checking
  hasPermission(userId: string, resource: string, action: string): Promise<boolean>;
  hasRole(userId: string, role: string): Promise<boolean>;
  hasAnyRole(userId: string, roles: string[]): Promise<boolean>;
  hasAllRoles(userId: string, roles: string[]): Promise<boolean>;

  // Role management
  assignRole(userId: string, role: string): Promise<void>;
  removeRole(userId: string, role: string): Promise<void>;
  getUserRoles(userId: string): Promise<Role[]>;
  getAllRoles(): Promise<Role[]>;

  // Permission management
  grantPermission(userId: string, resource: string, actions: string[]): Promise<void>;
  revokePermission(userId: string, resource: string, actions: string[]): Promise<void>;
  getUserPermissions(userId: string): Promise<Permission[]>;

  // Resource-based access control
  canAccessResource(userId: string, resourceId: string, action: string): Promise<boolean>;
  getResourcePermissions(resourceId: string): Promise<ResourcePermission[]>;
  setResourcePermissions(resourceId: string, permissions: ResourcePermission[]): Promise<void>;

  // Role hierarchy and inheritance
  createRoleHierarchy(parentRole: string, childRole: string): Promise<void>;
  removeRoleHierarchy(parentRole: string, childRole: string): Promise<void>;
  getRoleHierarchy(): Promise<RoleHierarchy>;

  // Audit and compliance
  logAccessAttempt(userId: string, resource: string, action: string, granted: boolean): Promise<void>;
  getAccessAuditLog(filters: AuditLogFilter): Promise<AccessAuditEntry[]>;
  
  // Provider management
  initialize(config: AuthorizationConfig): Promise<void>;
  isHealthy(): Promise<boolean>;
}

// Core Types
export interface Role {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  permissions: string[];
  inheritsFrom?: string[]; // Parent roles
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  granted: boolean;
  conditions?: PermissionCondition[];
  expiresAt?: Date;
  grantedAt: Date;
  grantedBy: string;
}

export interface PermissionCondition {
  type: 'time_based' | 'ip_based' | 'device_based' | 'custom';
  value: any;
  operator: 'equals' | 'contains' | 'in' | 'between';
}

export interface ResourcePermission {
  userId: string;
  resourceId: string;
  resourceType: string;
  permissions: string[];
  conditions?: PermissionCondition[];
  expiresAt?: Date;
}

export interface RoleHierarchy {
  roles: Role[];
  relationships: RoleRelationship[];
}

export interface RoleRelationship {
  parentRole: string;
  childRole: string;
  inherited: boolean;
}

// Audit and Compliance
export interface AccessAuditEntry {
  id: string;
  userId: string;
  resource: string;
  action: string;
  granted: boolean;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AuditLogFilter {
  userId?: string;
  resource?: string;
  action?: string;
  granted?: boolean;
  startDate?: Date;
  endDate?: Date;
  ipAddress?: string;
  limit?: number;
  offset?: number;
}

// Configuration
export interface AuthorizationConfig {
  provider: AuthorizationProviderType;
  roles: RoleDefinition[];
  resources: ResourceDefinition[];
  auditEnabled: boolean;
  cacheEnabled: boolean;
  cacheTTL?: number;
}

export type AuthorizationProviderType = 'firebase' | 'cognito' | 'google' | 'azure' | 'local';

export interface RoleDefinition {
  name: string;
  displayName: string;
  description: string;
  permissions: string[];
  inheritsFrom?: string[];
}

export interface ResourceDefinition {
  name: string;
  type: string;
  actions: string[];
  defaultPermissions?: Record<string, string[]>; // role -> actions
}

// Predefined Enterprise Roles
export const ENTERPRISE_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin', 
  MANAGER: 'manager',
  OPERATOR: 'operator',
  VIEWER: 'viewer',
  API_USER: 'api_user'
} as const;

// Predefined Resources and Actions
export const RESOURCES = {
  STREAMS: 'streams',
  CONTENT: 'content',
  DEVICES: 'devices',
  ANALYTICS: 'analytics',
  SETTINGS: 'settings',
  USERS: 'users'
} as const;

export const ACTIONS = {
  CREATE: 'create',
  READ: 'read', 
  UPDATE: 'update',
  DELETE: 'delete',
  CONTROL: 'control',
  MONITOR: 'monitor'
} as const;
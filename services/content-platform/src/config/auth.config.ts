import { AuthProviderConfig, AuthProviderType } from '@/interfaces/IAuthProvider';
import { AuthorizationConfig } from '@/interfaces/IAuthorizationProvider';

/**
 * Authentication Configuration Manager
 * 
 * Centralized configuration for pluggable authentication providers.
 * Supports environment-based provider selection and runtime switching.
 * 
 * Environment Variables:
 * - AUTH_PROVIDER: firebase|cognito|google|azure|jwt
 * - FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT
 * - COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, AWS_REGION
 * - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 * - JWT_SECRET_KEY, JWT_ALGORITHM
 */

export class AuthConfigManager {
  private static instance: AuthConfigManager;
  private currentConfig: AuthProviderConfig | null = null;

  private constructor() {}

  static getInstance(): AuthConfigManager {
    if (!AuthConfigManager.instance) {
      AuthConfigManager.instance = new AuthConfigManager();
    }
    return AuthConfigManager.instance;
  }

  /**
   * Get authentication provider configuration from environment
   */
  getAuthConfig(): AuthProviderConfig {
    if (this.currentConfig) {
      return this.currentConfig;
    }

    const providerType = (process.env.AUTH_PROVIDER as AuthProviderType) || 'jwt';
    
    const config: AuthProviderConfig = {
      type: providerType
    };

    switch (providerType) {
      case 'firebase':
        config.firebase = {
          projectId: process.env.FIREBASE_PROJECT_ID!,
          serviceAccountKey: process.env.FIREBASE_SERVICE_ACCOUNT!,
          databaseURL: process.env.FIREBASE_DATABASE_URL,
          apiKey: process.env.FIREBASE_API_KEY
        };
        break;

      case 'cognito':
        config.cognito = {
          userPoolId: process.env.COGNITO_USER_POOL_ID!,
          clientId: process.env.COGNITO_CLIENT_ID!,
          clientSecret: process.env.COGNITO_CLIENT_SECRET,
          region: process.env.AWS_REGION || 'us-east-1',
          identityPoolId: process.env.COGNITO_IDENTITY_POOL_ID
        };
        break;

      case 'google':
        config.google = {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          projectId: process.env.GOOGLE_PROJECT_ID!,
          serviceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT
        };
        break;

      case 'azure':
        config.azure = {
          tenantId: process.env.AZURE_TENANT_ID!,
          clientId: process.env.AZURE_CLIENT_ID!,
          clientSecret: process.env.AZURE_CLIENT_SECRET!,
          authority: process.env.AZURE_AUTHORITY
        };
        break;

      case 'jwt':
      default:
        config.jwt = {
          secretKey: process.env.JWT_SECRET_KEY || 'default-secret-key',
          algorithm: (process.env.JWT_ALGORITHM as 'HS256' | 'RS256') || 'HS256',
          expiresIn: process.env.JWT_EXPIRES_IN || '1h',
          refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
          issuer: process.env.JWT_ISSUER || 'live-ad-detection',
          audience: process.env.JWT_AUDIENCE || 'content-platform'
        };
        break;
    }

    this.currentConfig = config;
    return config;
  }

  /**
   * Get authorization configuration
   */
  getAuthorizationConfig(): AuthorizationConfig {
    const authConfig = this.getAuthConfig();
    
    return {
      provider: this.mapAuthProviderToAuthorization(authConfig.type),
      roles: this.getDefaultRoles(),
      resources: this.getDefaultResources(),
      auditEnabled: process.env.AUDIT_ENABLED === 'true',
      cacheEnabled: process.env.AUTH_CACHE_ENABLED !== 'false',
      cacheTTL: parseInt(process.env.AUTH_CACHE_TTL || '300') // 5 minutes
    };
  }

  /**
   * Override configuration (useful for testing)
   */
  setConfig(config: AuthProviderConfig): void {
    this.currentConfig = config;
  }

  /**
   * Clear cached configuration
   */
  clearConfig(): void {
    this.currentConfig = null;
  }

  /**
   * Validate current configuration
   */
  validateConfig(): { isValid: boolean; errors: string[] } {
    const config = this.getAuthConfig();
    const errors: string[] = [];

    // Validate required environment variables based on provider
    switch (config.type) {
      case 'firebase':
        if (!process.env.FIREBASE_PROJECT_ID) errors.push('FIREBASE_PROJECT_ID is required');
        if (!process.env.FIREBASE_SERVICE_ACCOUNT) errors.push('FIREBASE_SERVICE_ACCOUNT is required');
        break;

      case 'cognito':
        if (!process.env.COGNITO_USER_POOL_ID) errors.push('COGNITO_USER_POOL_ID is required');
        if (!process.env.COGNITO_CLIENT_ID) errors.push('COGNITO_CLIENT_ID is required');
        break;

      case 'google':
        if (!process.env.GOOGLE_CLIENT_ID) errors.push('GOOGLE_CLIENT_ID is required');
        if (!process.env.GOOGLE_CLIENT_SECRET) errors.push('GOOGLE_CLIENT_SECRET is required');
        break;

      case 'azure':
        if (!process.env.AZURE_TENANT_ID) errors.push('AZURE_TENANT_ID is required');
        if (!process.env.AZURE_CLIENT_ID) errors.push('AZURE_CLIENT_ID is required');
        break;

      case 'jwt':
        if (!process.env.JWT_SECRET_KEY) {
          console.warn('JWT_SECRET_KEY not set, using default (not secure for production)');
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Private helper methods
  private mapAuthProviderToAuthorization(authType: AuthProviderType): 'firebase' | 'cognito' | 'google' | 'azure' | 'local' {
    switch (authType) {
      case 'firebase':
        return 'firebase';
      case 'cognito':
        return 'cognito';
      case 'google':
        return 'google';
      case 'azure':
        return 'azure';
      default:
        return 'local';
    }
  }

  private getDefaultRoles() {
    return [
      {
        name: 'super_admin',
        displayName: 'Super Administrator',
        description: 'Full system access',
        permissions: ['*'],
        inheritsFrom: []
      },
      {
        name: 'admin',
        displayName: 'Administrator',
        description: 'Administrative access to most features',
        permissions: ['streams.*', 'content.*', 'devices.*', 'analytics.*', 'settings.*'],
        inheritsFrom: []
      },
      {
        name: 'manager',
        displayName: 'Manager',
        description: 'Management access to streams and content',
        permissions: ['streams.*', 'content.*', 'devices.read', 'analytics.read'],
        inheritsFrom: []
      },
      {
        name: 'operator',
        displayName: 'Operator',
        description: 'Operational access to streams',
        permissions: ['streams.read', 'streams.control', 'content.read'],
        inheritsFrom: []
      },
      {
        name: 'viewer',
        displayName: 'Viewer',
        description: 'Read-only access',
        permissions: ['streams.read', 'analytics.read'],
        inheritsFrom: []
      }
    ];
  }

  private getDefaultResources() {
    return [
      {
        name: 'streams',
        type: 'resource',
        actions: ['create', 'read', 'update', 'delete', 'control'],
        defaultPermissions: {
          'admin': ['create', 'read', 'update', 'delete', 'control'],
          'manager': ['create', 'read', 'update', 'control'],
          'operator': ['read', 'control'],
          'viewer': ['read']
        }
      },
      {
        name: 'content',
        type: 'resource',
        actions: ['create', 'read', 'update', 'delete'],
        defaultPermissions: {
          'admin': ['create', 'read', 'update', 'delete'],
          'manager': ['create', 'read', 'update'],
          'operator': ['read'],
          'viewer': ['read']
        }
      },
      {
        name: 'devices',
        type: 'resource',
        actions: ['create', 'read', 'update', 'delete', 'control'],
        defaultPermissions: {
          'admin': ['create', 'read', 'update', 'delete', 'control'],
          'manager': ['read'],
          'operator': ['read'],
          'viewer': ['read']
        }
      }
    ];
  }
}

// Configuration validation utilities
export function validateAuthEnvironment(): { isValid: boolean; missingVars: string[] } {
  const authProvider = process.env.AUTH_PROVIDER as AuthProviderType;
  const missingVars: string[] = [];

  if (!authProvider) {
    missingVars.push('AUTH_PROVIDER');
    return { isValid: false, missingVars };
  }

  switch (authProvider) {
    case 'firebase':
      if (!process.env.FIREBASE_PROJECT_ID) missingVars.push('FIREBASE_PROJECT_ID');
      if (!process.env.FIREBASE_SERVICE_ACCOUNT) missingVars.push('FIREBASE_SERVICE_ACCOUNT');
      break;

    case 'cognito':
      if (!process.env.COGNITO_USER_POOL_ID) missingVars.push('COGNITO_USER_POOL_ID');
      if (!process.env.COGNITO_CLIENT_ID) missingVars.push('COGNITO_CLIENT_ID');
      break;

    case 'google':
      if (!process.env.GOOGLE_CLIENT_ID) missingVars.push('GOOGLE_CLIENT_ID');
      if (!process.env.GOOGLE_CLIENT_SECRET) missingVars.push('GOOGLE_CLIENT_SECRET');
      break;
  }

  return {
    isValid: missingVars.length === 0,
    missingVars
  };
}
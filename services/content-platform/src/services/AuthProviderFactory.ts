import { IAuthProvider, AuthProviderType, AuthProviderConfig } from '@/interfaces/IAuthProvider';
import { IAuthorizationProvider, AuthorizationConfig } from '@/interfaces/IAuthorizationProvider';

/**
 * Authentication Provider Factory
 * 
 * Factory Pattern + Strategy Pattern implementation for creating authentication providers.
 * Enables runtime switching between Firebase, AWS Cognito, Google Cloud, Azure AD, and custom JWT.
 * 
 * Design Principles:
 * - Factory Pattern: Centralized provider creation
 * - Strategy Pattern: Runtime provider selection
 * - Dependency Inversion: Returns abstractions, not concrete classes
 * - Single Responsibility: Provider creation and configuration
 */

export class AuthProviderFactory {
  private static instance: AuthProviderFactory;
  private providerCache = new Map<string, IAuthProvider>();
  private authorizationCache = new Map<string, IAuthorizationProvider>();

  private constructor() {}

  static getInstance(): AuthProviderFactory {
    if (!AuthProviderFactory.instance) {
      AuthProviderFactory.instance = new AuthProviderFactory();
    }
    return AuthProviderFactory.instance;
  }

  /**
   * Create authentication provider based on configuration
   */
  async createAuthProvider(config: AuthProviderConfig): Promise<IAuthProvider> {
    const cacheKey = `${config.type}-${JSON.stringify(config)}`;
    
    // Return cached provider if available
    if (this.providerCache.has(cacheKey)) {
      return this.providerCache.get(cacheKey)!;
    }

    let provider: IAuthProvider;

    switch (config.type) {
      case 'firebase':
        provider = await this.createFirebaseProvider(config);
        break;
      case 'cognito':
        provider = await this.createCognitoProvider(config);
        break;
      case 'google':
        provider = await this.createGoogleProvider(config);
        break;
      case 'azure':
        provider = await this.createAzureProvider(config);
        break;
      case 'jwt':
        provider = await this.createJWTProvider(config);
        break;
      default:
        throw new Error(`Unsupported auth provider type: ${config.type}`);
    }

    // Initialize provider
    await provider.initialize(config);
    
    // Cache for reuse
    this.providerCache.set(cacheKey, provider);
    
    return provider;
  }

  /**
   * Create authorization provider (TODO: Implement authorization providers)
   */
  async createAuthorizationProvider(config: AuthorizationConfig): Promise<IAuthorizationProvider> {
    throw new Error('Authorization providers not yet implemented');
  }

  /**
   * Get available auth provider types
   */
  getAvailableAuthProviders(): AuthProviderType[] {
    return ['firebase', 'cognito', 'google', 'azure', 'jwt'];
  }

  /**
   * Validate provider configuration
   */
  validateConfig(config: AuthProviderConfig): ValidationResult {
    const errors: string[] = [];

    switch (config.type) {
      case 'firebase':
        if (!config.firebase?.projectId) errors.push('Firebase projectId is required');
        if (!config.firebase?.serviceAccountKey) errors.push('Firebase serviceAccountKey is required');
        break;
      case 'cognito':
        if (!config.cognito?.userPoolId) errors.push('Cognito userPoolId is required');
        if (!config.cognito?.clientId) errors.push('Cognito clientId is required');
        if (!config.cognito?.region) errors.push('Cognito region is required');
        break;
      case 'google':
        if (!config.google?.clientId) errors.push('Google clientId is required');
        if (!config.google?.clientSecret) errors.push('Google clientSecret is required');
        break;
      case 'azure':
        if (!config.azure?.tenantId) errors.push('Azure tenantId is required');
        if (!config.azure?.clientId) errors.push('Azure clientId is required');
        if (!config.azure?.clientSecret) errors.push('Azure clientSecret is required');
        break;
      case 'jwt':
        if (!config.jwt?.secretKey) errors.push('JWT secretKey is required');
        if (!config.jwt?.algorithm) errors.push('JWT algorithm is required');
        break;
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Clear cached providers (useful for testing)
   */
  clearCache(): void {
    this.providerCache.clear();
    this.authorizationCache.clear();
  }

  // Private factory methods for each provider type
  private async createFirebaseProvider(config: AuthProviderConfig): Promise<IAuthProvider> {
    // Dynamic import to avoid loading Firebase if not needed
    const { FirebaseAuthProvider } = await import('@/services/auth/FirebaseAuthProvider');
    return new FirebaseAuthProvider();
  }

  private async createCognitoProvider(config: AuthProviderConfig): Promise<IAuthProvider> {
    const { CognitoAuthProvider } = await import('@/services/auth/CognitoAuthProvider');
    return new CognitoAuthProvider();
  }

  private async createGoogleProvider(config: AuthProviderConfig): Promise<IAuthProvider> {
    const { GoogleAuthProvider } = await import('@/services/auth/GoogleAuthProvider');
    return new GoogleAuthProvider();
  }

  private async createAzureProvider(config: AuthProviderConfig): Promise<IAuthProvider> {
    const { AzureAuthProvider } = await import('@/services/auth/AzureAuthProvider');
    return new AzureAuthProvider();
  }

  private async createJWTProvider(config: AuthProviderConfig): Promise<IAuthProvider> {
    const { JwtAuthProvider } = await import('@/services/auth/JwtAuthProvider');
    return new JwtAuthProvider();
  }

  // TODO: Implement authorization providers
  // private async createFirebaseAuthorizationProvider(config: AuthorizationConfig): Promise<IAuthorizationProvider>
  // private async createCognitoAuthorizationProvider(config: AuthorizationConfig): Promise<IAuthorizationProvider>
  // private async createLocalAuthorizationProvider(config: AuthorizationConfig): Promise<IAuthorizationProvider>
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}
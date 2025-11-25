import { 
  IAuthProvider, 
  AuthProviderType, 
  AuthCredentials, 
  AuthResult, 
  TokenValidationResult,
  User,
  CreateUserRequest,
  UpdateUserRequest,
  AuthSession,
  SessionMetadata,
  SessionValidationResult,
  AuthProviderConfig,
  AuthProviderMetrics,
  AuthError,
  AuthErrorCode
} from '@/interfaces/IAuthProvider';

/**
 * JWT Authentication Provider
 * 
 * Self-contained JWT-based authentication with local user management.
 * Ideal for microservices or when external auth providers are not available.
 * 
 * Features:
 * - Local user database (in-memory for demo, would use DB in production)
 * - JWT token generation and validation
 * - Custom role-based access control
 * - Refresh token support
 * - Password hashing with bcrypt
 */
export class JwtAuthProvider implements IAuthProvider {
  readonly providerType: AuthProviderType = 'jwt';
  readonly providerName = 'JSON Web Token Authentication';

  private users = new Map<string, User>();
  private sessions = new Map<string, AuthSession>();
  private isInitialized = false;
  private metrics: AuthProviderMetrics;
  private jwtConfig: any;

  constructor() {
    this.metrics = this.createEmptyMetrics();
  }

  async initialize(config: AuthProviderConfig): Promise<void> {
    try {
      if (this.isInitialized) return;

      if (!config.jwt) {
        throw new Error('JWT configuration is required');
      }

      this.jwtConfig = config.jwt;

      // Initialize with default admin user if none exists
      if (this.users.size === 0) {
        await this.createDefaultAdminUser();
      }

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`JWT Auth initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async authenticate(credentials: AuthCredentials): Promise<AuthResult> {
    const startTime = performance.now();
    this.metrics.totalRequests++;

    try {
      let user: User;

      switch (credentials.type) {
        case 'email_password':
          user = await this.authenticateEmailPassword(credentials);
          break;
        case 'api_key':
          user = await this.authenticateApiKey(credentials);
          break;
        default:
          throw new Error(`Unsupported credential type: ${credentials.type}`);
      }

      // Generate JWT tokens
      const { jwt } = await import('jsonwebtoken');
      
      const payload = {
        sub: user.id,
        email: user.email,
        roles: user.roles,
        permissions: user.permissions,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + this.parseExpirationTime(this.jwtConfig.expiresIn),
        iss: this.jwtConfig.issuer,
        aud: this.jwtConfig.audience
      };

      const accessToken = jwt.sign(payload, this.jwtConfig.secretKey, {
        algorithm: this.jwtConfig.algorithm
      });

      const refreshPayload = {
        sub: user.id,
        type: 'refresh',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + this.parseExpirationTime(this.jwtConfig.refreshExpiresIn)
      };

      const refreshToken = jwt.sign(refreshPayload, this.jwtConfig.secretKey, {
        algorithm: this.jwtConfig.algorithm
      });

      this.metrics.successfulAuths++;
      this.updateMetrics(startTime, true);

      return {
        success: true,
        user,
        accessToken,
        refreshToken,
        expiresAt: new Date(payload.exp * 1000),
        metadata: {
          provider: 'jwt',
          algorithm: this.jwtConfig.algorithm
        }
      };

    } catch (error) {
      this.metrics.failedAuths++;
      this.updateMetrics(startTime, false);

      return {
        success: false,
        error: {
          code: AuthErrorCode.INVALID_CREDENTIALS,
          message: error instanceof Error ? error.message : 'Authentication failed'
        }
      };
    }
  }

  async validateToken(token: string): Promise<TokenValidationResult> {
    try {
      const { jwt } = await import('jsonwebtoken');
      
      const decoded = jwt.verify(token, this.jwtConfig.secretKey, {
        algorithms: [this.jwtConfig.algorithm],
        issuer: this.jwtConfig.issuer,
        audience: this.jwtConfig.audience
      }) as any;

      // Check if token is refresh token
      if (decoded.type === 'refresh') {
        return {
          valid: false,
          error: 'Refresh token cannot be used for authentication'
        };
      }

      const user = this.users.get(decoded.sub);
      if (!user || !user.isActive) {
        return {
          valid: false,
          error: 'User not found or inactive'
        };
      }

      return {
        valid: true,
        user,
        permissions: decoded.permissions || [],
        roles: decoded.roles || [],
        expiresAt: new Date(decoded.exp * 1000)
      };

    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Token validation failed'
      };
    }
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    try {
      const { jwt } = await import('jsonwebtoken');
      
      const decoded = jwt.verify(refreshToken, this.jwtConfig.secretKey, {
        algorithms: [this.jwtConfig.algorithm]
      }) as any;

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid refresh token');
      }

      const user = this.users.get(decoded.sub);
      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      // Generate new access token
      const payload = {
        sub: user.id,
        email: user.email,
        roles: user.roles,
        permissions: user.permissions,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + this.parseExpirationTime(this.jwtConfig.expiresIn),
        iss: this.jwtConfig.issuer,
        aud: this.jwtConfig.audience
      };

      const newAccessToken = jwt.sign(payload, this.jwtConfig.secretKey, {
        algorithm: this.jwtConfig.algorithm
      });

      return {
        success: true,
        user,
        accessToken: newAccessToken,
        refreshToken, // Keep same refresh token
        expiresAt: new Date(payload.exp * 1000)
      };

    } catch (error) {
      return {
        success: false,
        error: {
          code: AuthErrorCode.TOKEN_INVALID,
          message: error instanceof Error ? error.message : 'Token refresh failed'
        }
      };
    }
  }

  async revokeToken(token: string): Promise<void> {
    try {
      const validation = await this.validateToken(token);
      if (validation.valid && validation.user) {
        // In production, maintain a blacklist of revoked tokens
        // For now, we'll just remove associated sessions
        const userSessions = Array.from(this.sessions.values())
          .filter(session => session.userId === validation.user!.id);
        
        userSessions.forEach(session => {
          this.sessions.delete(session.id);
        });
      }
    } catch (error) {
      throw new Error(`Failed to revoke token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async createUser(userData: CreateUserRequest): Promise<User> {
    try {
      const { v4: uuidv4 } = await import('uuid');
      const bcrypt = await import('bcryptjs');
      
      const userId = uuidv4();
      
      // Check if user already exists
      const existingUser = Array.from(this.users.values()).find(u => u.email === userData.email);
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Hash password if provided
      let hashedPassword: string | undefined;
      if (userData.password) {
        hashedPassword = await bcrypt.hash(userData.password, 10);
      }

      const user: User = {
        id: userId,
        email: userData.email,
        displayName: userData.displayName || '',
        roles: userData.roles || ['viewer'],
        permissions: this.calculatePermissionsFromRoles(userData.roles || ['viewer']),
        metadata: {
          ...userData.metadata,
          hashedPassword
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.users.set(userId, user);
      return user;

    } catch (error) {
      throw new Error(`Failed to create user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getUserById(userId: string): Promise<User | null> {
    const user = this.users.get(userId);
    return user || null;
  }

  async updateUser(userId: string, updates: UpdateUserRequest): Promise<User> {
    try {
      const user = this.users.get(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const updatedUser: User = {
        ...user,
        email: updates.email || user.email,
        displayName: updates.displayName || user.displayName,
        roles: updates.roles || user.roles,
        isActive: updates.isActive !== undefined ? updates.isActive : user.isActive,
        metadata: { ...user.metadata, ...updates.metadata },
        updatedAt: new Date()
      };

      // Recalculate permissions if roles changed
      if (updates.roles) {
        updatedUser.permissions = this.calculatePermissionsFromRoles(updates.roles);
      }

      // Hash new password if provided
      if (updates.password) {
        const bcrypt = await import('bcryptjs');
        updatedUser.metadata = {
          ...updatedUser.metadata,
          hashedPassword: await bcrypt.hash(updates.password, 10)
        };
      }

      this.users.set(userId, updatedUser);
      return updatedUser;

    } catch (error) {
      throw new Error(`Failed to update user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteUser(userId: string): Promise<void> {
    if (!this.users.has(userId)) {
      throw new Error('User not found');
    }

    // Remove user and associated sessions
    this.users.delete(userId);
    
    const userSessions = Array.from(this.sessions.entries())
      .filter(([_, session]) => session.userId === userId);
    
    userSessions.forEach(([sessionId]) => {
      this.sessions.delete(sessionId);
    });
  }

  async createSession(userId: string, metadata?: SessionMetadata): Promise<AuthSession> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const { v4: uuidv4 } = await import('uuid');
    const sessionId = uuidv4();
    
    const session: AuthSession = {
      id: sessionId,
      userId,
      token: '', // Would be set during authentication
      expiresAt: new Date(Date.now() + this.parseExpirationTime(this.jwtConfig.expiresIn) * 1000),
      metadata,
      createdAt: new Date(),
      lastActivity: new Date()
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  async validateSession(sessionToken: string): Promise<SessionValidationResult> {
    const tokenValidation = await this.validateToken(sessionToken);
    
    if (!tokenValidation.valid || !tokenValidation.user) {
      return { valid: false, error: tokenValidation.error };
    }

    // Find session by user ID
    const session = Array.from(this.sessions.values())
      .find(s => s.userId === tokenValidation.user!.id);

    if (!session) {
      return { valid: false, error: 'Session not found' };
    }

    // Update last activity
    session.lastActivity = new Date();
    this.sessions.set(session.id, session);

    return {
      valid: true,
      session,
      user: tokenValidation.user
    };
  }

  async endSession(sessionToken: string): Promise<void> {
    const validation = await this.validateToken(sessionToken);
    if (validation.valid && validation.user) {
      const userSessions = Array.from(this.sessions.values())
        .filter(session => session.userId === validation.user!.id);
      
      userSessions.forEach(session => {
        this.sessions.delete(session.id);
      });
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      this.metrics.lastHealthCheck = new Date();
      return this.isInitialized && this.jwtConfig != null;
    } catch (error) {
      return false;
    }
  }

  async getProviderMetrics(): Promise<AuthProviderMetrics> {
    this.metrics.errorRate = this.metrics.totalRequests > 0 
      ? (this.metrics.failedAuths / this.metrics.totalRequests) * 100 
      : 0;

    this.metrics.activeUsers = Array.from(this.users.values()).filter(u => u.isActive).length;
    this.metrics.activeSessions = this.sessions.size;

    return { ...this.metrics };
  }

  // Private helper methods
  private async authenticateEmailPassword(credentials: AuthCredentials): Promise<User> {
    if (!credentials.email || !credentials.password) {
      throw new Error('Email and password are required');
    }

    const user = Array.from(this.users.values()).find(u => u.email === credentials.email);
    if (!user || !user.isActive) {
      throw new Error('Invalid credentials');
    }

    if (!user.metadata?.hashedPassword) {
      throw new Error('User has no password set');
    }

    const bcrypt = await import('bcryptjs');
    const isValidPassword = await bcrypt.compare(credentials.password, user.metadata.hashedPassword);
    
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    user.lastLoginAt = new Date();
    this.users.set(user.id, user);

    return user;
  }

  private async authenticateApiKey(credentials: AuthCredentials): Promise<User> {
    if (!credentials.apiKey) {
      throw new Error('API key is required');
    }

    // Find user by API key in metadata
    const user = Array.from(this.users.values()).find(u => 
      u.metadata?.apiKey === credentials.apiKey && u.isActive
    );

    if (!user) {
      throw new Error('Invalid API key');
    }

    return user;
  }

  private async createDefaultAdminUser(): Promise<void> {
    const { v4: uuidv4 } = await import('uuid');
    const bcrypt = await import('bcryptjs');
    
    const adminId = uuidv4();
    const defaultPassword = 'admin123'; // In production, this should be configurable
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    const adminUser: User = {
      id: adminId,
      email: 'admin@localhost',
      displayName: 'Default Administrator',
      roles: ['super_admin'],
      permissions: ['*'],
      metadata: {
        hashedPassword,
        isDefault: true
      },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.users.set(adminId, adminUser);
  }

  private calculatePermissionsFromRoles(roles: string[]): string[] {
    const rolePermissions: Record<string, string[]> = {
      'super_admin': ['*'],
      'admin': ['streams.*', 'content.*', 'devices.*', 'analytics.*', 'settings.*', 'users.*'],
      'manager': ['streams.*', 'content.*', 'devices.read', 'analytics.read', 'users.read'],
      'operator': ['streams.read', 'streams.control', 'content.read', 'devices.read'],
      'viewer': ['streams.read', 'analytics.read'],
      'api_user': ['api_access']
    };

    const permissions = new Set<string>();
    roles.forEach(role => {
      const rolePerms = rolePermissions[role] || [];
      rolePerms.forEach(perm => permissions.add(perm));
    });

    return Array.from(permissions);
  }

  private parseExpirationTime(expTime: string): number {
    // Parse time strings like "1h", "7d", "30m"
    const timeValue = parseInt(expTime);
    const timeUnit = expTime.slice(-1);

    switch (timeUnit) {
      case 's': return timeValue;
      case 'm': return timeValue * 60;
      case 'h': return timeValue * 3600;
      case 'd': return timeValue * 86400;
      case 'w': return timeValue * 604800;
      default: return 3600; // Default to 1 hour
    }
  }

  private createEmptyMetrics(): AuthProviderMetrics {
    return {
      totalRequests: 0,
      successfulAuths: 0,
      failedAuths: 0,
      averageResponseTime: 0,
      errorRate: 0,
      activeUsers: 0,
      activeSessions: 0,
      lastHealthCheck: new Date()
    };
  }

  private updateMetrics(startTime: number, success: boolean): void {
    const responseTime = performance.now() - startTime;
    this.metrics.averageResponseTime = (this.metrics.averageResponseTime + responseTime) / 2;
    
    if (success) {
      this.metrics.successfulAuths++;
    } else {
      this.metrics.failedAuths++;
    }
  }
}
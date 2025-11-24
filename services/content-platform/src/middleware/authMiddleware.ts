import { Request, Response, NextFunction } from 'express';
import { IAuthService } from '@/interfaces/IAuthService';
import { Logger } from '@/utils/Logger';

/**
 * Authentication Middleware
 * 
 * Provides middleware functions for authentication and authorization
 * Verifies JWT tokens and checks user permissions
 * 
 * Single Responsibility: Handle authentication middleware logic
 * Open/Closed: Extensible for additional auth checks
 * Liskov Substitution: Uses standard Express middleware pattern
 * Interface Segregation: Focused on middleware concerns
 * Dependency Inversion: Uses injected auth service
 */

interface AuthRequest extends Request {
  user?: any;
}

export class AuthMiddleware {
  private logger: Logger;

  constructor(private authService: IAuthService) {
    this.logger = new Logger('AuthMiddleware');
  }

  /**
   * Authenticate request with JWT token
   * Adds user to request object if valid
   */
  authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = this.extractToken(req);

      if (!token) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const user = await this.authService.verifyToken(token);

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Invalid or expired token'
        });
        return;
      }

      if (!user.isActive) {
        res.status(401).json({
          success: false,
          message: 'Account is disabled'
        });
        return;
      }

      req.user = user;
      next();
    } catch (error) {
      this.logger.error('Authentication failed:', error);
      res.status(500).json({
        success: false,
        message: 'Authentication error'
      });
    }
  };

  /**
   * Optional authentication - adds user if token is present but doesn't fail if not
   */
  optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = this.extractToken(req);

      if (token) {
        const user = await this.authService.verifyToken(token);
        if (user && user.isActive) {
          req.user = user;
        }
      }

      next();
    } catch (error) {
      this.logger.error('Optional authentication failed:', error);
      next();
    }
  };

  /**
   * Require specific permission
   */
  requirePermission = (resource: string, action: string) => {
    return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user) {
          res.status(401).json({
            success: false,
            message: 'Authentication required'
          });
          return;
        }

        const hasPermission = await this.authService.hasPermission(req.user.id, resource, action);

        if (!hasPermission) {
          res.status(403).json({
            success: false,
            message: `Insufficient permissions. Required: ${resource}:${action}`
          });
          return;
        }

        next();
      } catch (error) {
        this.logger.error('Permission check failed:', error);
        res.status(500).json({
          success: false,
          message: 'Permission check error'
        });
      }
    };
  };

  /**
   * Require any of the specified permissions
   */
  requireAnyPermission = (permissions: Array<{ resource: string; action: string }>) => {
    return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user) {
          res.status(401).json({
            success: false,
            message: 'Authentication required'
          });
          return;
        }

        let hasAnyPermission = false;
        
        for (const { resource, action } of permissions) {
          const hasPermission = await this.authService.hasPermission(req.user.id, resource, action);
          if (hasPermission) {
            hasAnyPermission = true;
            break;
          }
        }

        if (!hasAnyPermission) {
          const permissionStrings = permissions.map(p => `${p.resource}:${p.action}`).join(', ');
          res.status(403).json({
            success: false,
            message: `Insufficient permissions. Required any of: ${permissionStrings}`
          });
          return;
        }

        next();
      } catch (error) {
        this.logger.error('Permission check failed:', error);
        res.status(500).json({
          success: false,
          message: 'Permission check error'
        });
      }
    };
  };

  /**
   * Require admin role
   */
  requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      if (!req.user.isAdmin()) {
        res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
        return;
      }

      next();
    } catch (error) {
      this.logger.error('Admin check failed:', error);
      res.status(500).json({
        success: false,
        message: 'Admin check error'
      });
    }
  };

  /**
   * Require user to own the resource or be admin
   */
  requireOwnership = (userIdParam: string = 'userId') => {
    return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user) {
          res.status(401).json({
            success: false,
            message: 'Authentication required'
          });
          return;
        }

        const targetUserId = req.params[userIdParam] || req.body[userIdParam];
        
        if (!targetUserId) {
          res.status(400).json({
            success: false,
            message: 'User ID parameter required'
          });
          return;
        }

        // Allow if user is accessing their own resource or is admin
        if (req.user.id === targetUserId || req.user.isAdmin()) {
          next();
          return;
        }

        res.status(403).json({
          success: false,
          message: 'Access denied. You can only access your own resources.'
        });
      } catch (error) {
        this.logger.error('Ownership check failed:', error);
        res.status(500).json({
          success: false,
          message: 'Ownership check error'
        });
      }
    };
  };

  /**
   * Require email to be verified
   */
  requireEmailVerified = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      if (!req.user.emailVerified) {
        res.status(403).json({
          success: false,
          message: 'Email verification required'
        });
        return;
      }

      next();
    } catch (error) {
      this.logger.error('Email verification check failed:', error);
      res.status(500).json({
        success: false,
        message: 'Email verification check error'
      });
    }
  };

  /**
   * Rate limiting for authentication attempts
   */
  rateLimitAuth = (maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000) => {
    const attempts = new Map<string, { count: number; resetTime: number }>();

    return (req: Request, res: Response, next: NextFunction): void => {
      const identifier = this.getClientIdentifier(req);
      const now = Date.now();

      let userAttempts = attempts.get(identifier);
      
      if (!userAttempts || now > userAttempts.resetTime) {
        userAttempts = { count: 0, resetTime: now + windowMs };
        attempts.set(identifier, userAttempts);
      }

      if (userAttempts.count >= maxAttempts) {
        const remainingTime = Math.ceil((userAttempts.resetTime - now) / 1000);
        res.status(429).json({
          success: false,
          message: `Too many authentication attempts. Try again in ${remainingTime} seconds.`
        });
        return;
      }

      // Increment attempts on authentication failure
      const originalSend = res.send;
      res.send = function(data: any) {
        if (res.statusCode === 401 || res.statusCode === 403) {
          userAttempts!.count++;
        }
        return originalSend.call(this, data);
      };

      next();
    };
  };

  /**
   * CORS middleware for authentication endpoints
   */
  corsAuth = (req: Request, res: Response, next: NextFunction): void => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    const origin = req.headers.origin;

    if (origin && allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }

    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }

    next();
  };

  /**
   * Security headers middleware
   */
  securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');
    res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    next();
  };

  /**
   * Extract JWT token from request
   */
  private extractToken(req: Request): string | null {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check query parameter (for WebSocket upgrades)
    if (req.query.token && typeof req.query.token === 'string') {
      return req.query.token;
    }

    return null;
  }

  /**
   * Get client identifier for rate limiting
   */
  private getClientIdentifier(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'] as string;
    const ip = forwarded ? forwarded.split(',')[0] : req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    return `${ip}:${userAgent}`;
  }
}

// Helper function to create middleware with auth service
export const createAuthMiddleware = (authService: IAuthService) => {
  return new AuthMiddleware(authService);
};

// Common permission sets
export const Permissions = {
  CONTENT: {
    CREATE: { resource: 'content', action: 'create' },
    READ: { resource: 'content', action: 'read' },
    UPDATE: { resource: 'content', action: 'update' },
    DELETE: { resource: 'content', action: 'delete' },
    MANAGE: { resource: 'content', action: '*' }
  },
  SCHEDULE: {
    CREATE: { resource: 'schedule', action: 'create' },
    READ: { resource: 'schedule', action: 'read' },
    UPDATE: { resource: 'schedule', action: 'update' },
    DELETE: { resource: 'schedule', action: 'delete' },
    EXECUTE: { resource: 'schedule', action: 'execute' },
    MANAGE: { resource: 'schedule', action: '*' }
  },
  USER: {
    CREATE: { resource: 'user', action: 'create' },
    READ: { resource: 'user', action: 'read' },
    UPDATE: { resource: 'user', action: 'update' },
    DELETE: { resource: 'user', action: 'delete' },
    MANAGE: { resource: 'user', action: '*' }
  },
  ANALYTICS: {
    READ: { resource: 'analytics', action: 'read' },
    EXPORT: { resource: 'analytics', action: 'export' },
    MANAGE: { resource: 'analytics', action: '*' }
  },
  PIP: {
    CREATE: { resource: 'pip', action: 'create' },
    READ: { resource: 'pip', action: 'read' },
    UPDATE: { resource: 'pip', action: 'update' },
    DELETE: { resource: 'pip', action: 'delete' },
    MANAGE: { resource: 'pip', action: '*' }
  },
  SYSTEM: {
    READ: { resource: 'system', action: 'read' },
    UPDATE: { resource: 'system', action: 'update' },
    MANAGE: { resource: 'system', action: '*' }
  }
};
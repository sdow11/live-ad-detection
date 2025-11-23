import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Authentication Middleware
 * 
 * Handles JWT token validation and user context
 */

export interface AuthenticatedUser {
  id: string;
  email: string;
  role?: string;
  iat?: number;
  exp?: number;
}

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * JWT Authentication middleware
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    // Skip authentication in development/test if configured
    if (process.env.SKIP_AUTH === 'true' && process.env.NODE_ENV !== 'production') {
      req.user = {
        id: 'test-user',
        email: 'test@example.com',
        role: 'user',
      };
      return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: {
          message: 'Authorization header required',
          type: 'AuthenticationError',
          status: 401,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          message: 'Authorization header must start with "Bearer "',
          type: 'AuthenticationError',
          status: 401,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    if (!token) {
      return res.status(401).json({
        error: {
          message: 'Token not provided',
          type: 'AuthenticationError',
          status: 401,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
    }

    // Verify JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET environment variable not set');
      return res.status(500).json({
        error: {
          message: 'Server configuration error',
          type: 'InternalServerError',
          status: 500,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
    }

    const decoded = jwt.verify(token, jwtSecret) as AuthenticatedUser;

    // Validate required fields
    if (!decoded.id || !decoded.email) {
      return res.status(401).json({
        error: {
          message: 'Invalid token payload',
          type: 'AuthenticationError',
          status: 401,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
    }

    // Add user to request object
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        error: {
          message: 'Invalid token',
          type: 'AuthenticationError',
          status: 401,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
    }

    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        error: {
          message: 'Token expired',
          type: 'AuthenticationError',
          status: 401,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
    }

    console.error('Authentication error:', error);
    return res.status(500).json({
      error: {
        message: 'Authentication failed',
        type: 'InternalServerError',
        status: 500,
        timestamp: new Date().toISOString(),
        path: req.path,
      },
    });
  }
}

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    if (!token) {
      return next();
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return next();
    }

    const decoded = jwt.verify(token, jwtSecret) as AuthenticatedUser;
    if (decoded.id && decoded.email) {
      req.user = decoded;
    }

    next();
  } catch (error) {
    // Ignore authentication errors in optional middleware
    next();
  }
}

/**
 * Role-based authorization middleware
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          type: 'AuthenticationError',
          status: 401,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
    }

    if (!req.user.role || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: {
          message: `Access denied. Required role: ${roles.join(' or ')}`,
          type: 'AuthorizationError',
          status: 403,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
    }

    next();
  };
}

/**
 * User ownership verification middleware
 */
export function requireOwnership(getUserIdFromParams: (req: Request) => string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          type: 'AuthenticationError',
          status: 401,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
    }

    const resourceUserId = getUserIdFromParams(req);
    
    // Allow if user owns the resource or is an admin
    if (req.user.id !== resourceUserId && req.user.role !== 'admin') {
      return res.status(403).json({
        error: {
          message: 'Access denied. You can only access your own resources.',
          type: 'AuthorizationError',
          status: 403,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
    }

    next();
  };
}
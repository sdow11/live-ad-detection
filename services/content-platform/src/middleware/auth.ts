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
      next();
      return;
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        error: {
          message: 'Authorization header required',
          type: 'AuthenticationError',
          status: 401,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
      return;
    }

    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: {
          message: 'Authorization header must start with "Bearer "',
          type: 'AuthenticationError',
          status: 401,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
      return;
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    if (!token) {
      res.status(401).json({
        error: {
          message: 'Token not provided',
          type: 'AuthenticationError',
          status: 401,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
      return;
    }

    // Verify JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET environment variable not set');
      res.status(500).json({
        error: {
          message: 'Server configuration error',
          type: 'InternalServerError',
          status: 500,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
      return;
    }

    const decoded = jwt.verify(token, jwtSecret) as AuthenticatedUser;

    // Validate required fields
    if (!decoded.id || !decoded.email) {
      res.status(401).json({
        error: {
          message: 'Invalid token payload',
          type: 'AuthenticationError',
          status: 401,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
      return;
    }

    // Add user to request object
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: {
          message: 'Invalid token',
          type: 'AuthenticationError',
          status: 401,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
      return;
    }

    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: {
          message: 'Token expired',
          type: 'AuthenticationError',
          status: 401,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
      return;
    }

    console.error('Authentication error:', error);
    res.status(500).json({
      error: {
        message: 'Authentication failed',
        type: 'InternalServerError',
        status: 500,
        timestamp: new Date().toISOString(),
        path: req.path,
      },
    });
    return;
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
      res.status(401).json({
        error: {
          message: 'Authentication required',
          type: 'AuthenticationError',
          status: 401,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
      return;
    }

    if (!req.user.role || !roles.includes(req.user.role)) {
      res.status(403).json({
        error: {
          message: `Access denied. Required role: ${roles.join(' or ')}`,
          type: 'AuthorizationError',
          status: 403,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
      return;
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
      res.status(401).json({
        error: {
          message: 'Authentication required',
          type: 'AuthenticationError',
          status: 401,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
      return;
    }

    const resourceUserId = getUserIdFromParams(req);
    
    // Allow if user owns the resource or is an admin
    if (req.user.id !== resourceUserId && req.user.role !== 'admin') {
      res.status(403).json({
        error: {
          message: 'Access denied. You can only access your own resources.',
          type: 'AuthorizationError',
          status: 403,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
      return;
    }

    next();
  };
}
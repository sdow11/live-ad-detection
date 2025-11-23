import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '@/utils/errors';

/**
 * Authentication Middleware
 * 
 * Single Responsibility: Validate user authentication
 * Open/Closed: Extensible for different auth strategies
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authorization token required');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      throw new UnauthorizedError('Authorization token required');
    }

    // In a real implementation, this would:
    // 1. Validate JWT token
    // 2. Extract user information from token
    // 3. Verify token hasn't expired
    // 4. Check token blacklist/revocation
    // 5. Load user permissions

    // Mock authentication for development/testing
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
      // Mock user for testing
      req.user = {
        id: token === 'test-token' ? 'test-user-id' : 'user-' + token,
        email: 'test@example.com',
        role: 'user',
      };
    } else {
      // Real JWT validation would go here
      // const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // req.user = decoded;
      
      // For now, throw error in production without proper JWT setup
      throw new UnauthorizedError('JWT validation not implemented');
    }

    next();
  } catch (error) {
    next(error);
  }
}
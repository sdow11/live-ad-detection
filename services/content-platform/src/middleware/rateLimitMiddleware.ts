import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { TooManyRequestsError } from '@/utils/errors';

/**
 * Rate Limiting Middleware
 * 
 * Single Responsibility: Prevent abuse through rate limiting
 * Open/Closed: Configurable limits for different endpoints
 * Liskov Substitution: Standard Express middleware interface
 * Interface Segregation: Focused on rate limiting only
 * Dependency Inversion: Uses express-rate-limit abstraction
 */

// General API rate limit
export const rateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later',
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        type: 'TooManyRequestsError',
        message: 'Too many requests, please try again later',
        statusCode: 429,
      },
    });
  },
});

// Upload-specific rate limit (more restrictive)
export const uploadRateLimitMiddleware = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 uploads per hour
  message: 'Upload rate limit exceeded, please try again later',
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        type: 'TooManyRequestsError',
        message: 'Upload rate limit exceeded, please try again later',
        statusCode: 429,
      },
    });
  },
});

// Auth rate limit (for login attempts)
export const authRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 auth requests per windowMs
  message: 'Too many authentication attempts, please try again later',
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        type: 'TooManyRequestsError',
        message: 'Too many authentication attempts, please try again later',
        statusCode: 429,
      },
    });
  },
});
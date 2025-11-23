import rateLimit from 'express-rate-limit';
import { TooManyRequestsError } from '@/utils/errors';

/**
 * Rate Limiting Middleware
 * 
 * Single Responsibility: Prevent abuse through rate limiting
 */

// General API rate limit
export const rateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: {
      type: 'TooManyRequestsError',
      message: 'Too many requests, please try again later',
      statusCode: 429,
    },
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    throw new TooManyRequestsError('Too many requests, please try again later');
  },
});

// Upload-specific rate limit (more restrictive)
export const uploadRateLimitMiddleware = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 uploads per hour
  message: {
    success: false,
    error: {
      type: 'TooManyRequestsError',
      message: 'Upload rate limit exceeded, please try again later',
      statusCode: 429,
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    throw new TooManyRequestsError('Upload rate limit exceeded, please try again later');
  },
});

// Auth rate limit (for login attempts)
export const authRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 auth requests per windowMs
  message: {
    success: false,
    error: {
      type: 'TooManyRequestsError',
      message: 'Too many authentication attempts, please try again later',
      statusCode: 429,
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    throw new TooManyRequestsError('Too many authentication attempts, please try again later');
  },
});
import { Request, Response, NextFunction } from 'express';
import { ValidationError, NotFoundError, InternalServerError } from '@/utils/errors';

/**
 * Error Handling Middleware
 * 
 * Centralized error handling following Express conventions
 * Maps custom errors to appropriate HTTP status codes
 */

export interface ErrorResponse {
  error: {
    message: string;
    type: string;
    status: number;
    timestamp: string;
    path: string;
    details?: any;
  };
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response<ErrorResponse>,
  next: NextFunction
): void {
  // Don't handle if response was already sent
  if (res.headersSent) {
    return next(error);
  }

  console.error('Error occurred:', {
    message: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  let status = 500;
  let message = 'Internal Server Error';
  let type = 'InternalServerError';
  let details: any = undefined;

  // Map custom errors to HTTP status codes
  if (error instanceof ValidationError) {
    status = 400;
    message = error.message;
    type = 'ValidationError';
    details = error.details;
  } else if (error instanceof NotFoundError) {
    status = 404;
    message = error.message;
    type = 'NotFoundError';
  } else if (error instanceof InternalServerError) {
    status = 500;
    message = process.env.NODE_ENV === 'production' 
      ? 'Internal Server Error' 
      : error.message;
    type = 'InternalServerError';
  } else if (error.name === 'MulterError') {
    status = 400;
    type = 'FileUploadError';
    
    // Handle specific multer errors
    switch ((error as any).code) {
      case 'LIMIT_FILE_SIZE':
        message = 'File size too large. Maximum size is 2GB.';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field. Only "file" field is allowed.';
        break;
      default:
        message = error.message;
    }
  } else if (error.name === 'JsonWebTokenError') {
    status = 401;
    message = 'Invalid authentication token';
    type = 'AuthenticationError';
  } else if (error.name === 'TokenExpiredError') {
    status = 401;
    message = 'Authentication token has expired';
    type = 'AuthenticationError';
  } else if (error.name === 'SyntaxError' && 'body' in error) {
    status = 400;
    message = 'Invalid JSON in request body';
    type = 'ValidationError';
  }

  // Create error response
  const errorResponse: ErrorResponse = {
    error: {
      message,
      type,
      status,
      timestamp: new Date().toISOString(),
      path: req.path,
      details,
    },
  };

  // Add request ID if available
  if (req.headers['x-request-id']) {
    (errorResponse.error as any).requestId = req.headers['x-request-id'];
  }

  // In development, include stack trace
  if (process.env.NODE_ENV === 'development') {
    (errorResponse.error as any).stack = error.stack;
  }

  res.status(status).json(errorResponse);
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(
  req: Request,
  res: Response<ErrorResponse>,
  next: NextFunction
): void {
  const errorResponse: ErrorResponse = {
    error: {
      message: `Route not found: ${req.method} ${req.path}`,
      type: 'NotFoundError',
      status: 404,
      timestamp: new Date().toISOString(),
      path: req.path,
    },
  };

  res.status(404).json(errorResponse);
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler<T = any>(
  fn: (req: Request, res: Response<T>, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response<T>, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Request timeout handler
 */
export function timeoutHandler(timeoutMs: number = 30000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        const errorResponse: ErrorResponse = {
          error: {
            message: 'Request timeout',
            type: 'TimeoutError',
            status: 408,
            timestamp: new Date().toISOString(),
            path: req.path,
          },
        };
        res.status(408).json(errorResponse);
      }
    }, timeoutMs);

    // Clear timeout when response is finished
    res.on('finish', () => {
      clearTimeout(timeout);
    });

    res.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  };
}
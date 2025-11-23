import { Request, Response, NextFunction } from 'express';
import { BaseError, formatErrorResponse, isOperationalError } from '@/utils/errors';

/**
 * Global Error Handling Middleware
 * 
 * Single Responsibility: Handle all application errors
 */
export function errorMiddleware(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log error details
  console.error('Error occurred:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    userId: req.user?.id,
    timestamp: new Date().toISOString(),
  });

  // Handle operational errors
  if (isOperationalError(error)) {
    const response = formatErrorResponse(error);
    const statusCode = (error as BaseError).statusCode || 500;
    
    res.status(statusCode).json(response);
    return;
  }

  // Handle multer errors
  if (error.message.includes('File too large')) {
    res.status(400).json({
      success: false,
      error: {
        type: 'ValidationError',
        message: 'File size exceeds maximum limit',
        statusCode: 400,
      },
    });
    return;
  }

  if (error.message.includes('Unsupported file type')) {
    res.status(400).json({
      success: false,
      error: {
        type: 'ValidationError',
        message: error.message,
        statusCode: 400,
      },
    });
    return;
  }

  // Handle unexpected errors
  res.status(500).json({
    success: false,
    error: {
      type: 'InternalServerError',
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred'
        : error.message,
      statusCode: 500,
    },
  });
}

/**
 * 404 Not Found Handler
 */
export function notFoundMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.status(404).json({
    success: false,
    error: {
      type: 'NotFoundError',
      message: `Route ${req.method} ${req.url} not found`,
      statusCode: 404,
    },
  });
}

/**
 * Async error wrapper
 * Wraps async route handlers to catch promise rejections
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
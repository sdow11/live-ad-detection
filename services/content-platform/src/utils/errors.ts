/**
 * Custom Error Classes
 * 
 * Single Responsibility: Define application-specific errors
 */

export class BaseError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number,
    isOperational = true,
    details?: any
  ) {
    super(message);
    
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends BaseError {
  constructor(message: string, details?: string[]) {
    super(message, 400, true, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends BaseError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, true);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends BaseError {
  constructor(message: string = 'Unauthorized access') {
    super(message, 401, true);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends BaseError {
  constructor(message: string = 'Access forbidden') {
    super(message, 403, true);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends BaseError {
  constructor(message: string) {
    super(message, 409, true);
    this.name = 'ConflictError';
  }
}

export class InternalServerError extends BaseError {
  constructor(message: string = 'Internal server error', details?: any) {
    super(message, 500, false, details);
    this.name = 'InternalServerError';
  }
}

export class ServiceUnavailableError extends BaseError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503, true);
    this.name = 'ServiceUnavailableError';
  }
}

export class TooManyRequestsError extends BaseError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, true);
    this.name = 'TooManyRequestsError';
  }
}

/**
 * Error handling utility functions
 */

export function isOperationalError(error: Error): boolean {
  if (error instanceof BaseError) {
    return error.isOperational;
  }
  return false;
}

export function formatErrorResponse(error: Error) {
  if (error instanceof BaseError) {
    return {
      success: false,
      error: {
        type: error.name,
        message: error.message,
        statusCode: error.statusCode,
        details: error.details,
      },
    };
  }

  // Handle unknown errors
  return {
    success: false,
    error: {
      type: 'UnknownError',
      message: 'An unexpected error occurred',
      statusCode: 500,
    },
  };
}
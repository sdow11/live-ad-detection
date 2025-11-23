import { Request, Response } from 'express';
import { ValidationError } from '../middleware/validation';
import { AuthenticatedUser } from '../middleware/auth';

/**
 * Base Controller
 * 
 * Provides common functionality for all controllers
 * Implements SOLID principles with shared utilities
 */
export abstract class BaseController {
  /**
   * Extract user ID from authenticated request
   */
  protected getUserId(req: Request): string {
    if (!req.user?.id) {
      throw new ValidationError('User authentication required', ['userId']);
    }
    return req.user.id;
  }

  /**
   * Handle errors in a consistent way
   */
  protected handleError(res: Response, error: any): void {
    console.error('Controller error:', error);

    if (error instanceof ValidationError) {
      res.status(400).json({
        success: false,
        message: error.message,
        errors: error.details
      });
      return;
    }

    if (error.name === 'NotFoundError') {
      res.status(404).json({
        success: false,
        message: error.message || 'Resource not found'
      });
      return;
    }

    if (error.name === 'UnauthorizedError') {
      res.status(401).json({
        success: false,
        message: error.message || 'Unauthorized'
      });
      return;
    }

    if (error.name === 'ForbiddenError') {
      res.status(403).json({
        success: false,
        message: error.message || 'Forbidden'
      });
      return;
    }

    // Generic server error
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }

  /**
   * Send success response
   */
  protected sendSuccess(res: Response, data: any, message?: string, status = 200): void {
    res.status(status).json({
      success: true,
      data,
      message
    });
  }

  /**
   * Send error response
   */
  protected sendError(res: Response, message: string, status = 400, errors?: string[]): void {
    res.status(status).json({
      success: false,
      message,
      errors
    });
  }
}
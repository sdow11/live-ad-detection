import { Request, Response } from 'express';
import { IAuthService, LoginCredentials, RegisterData } from '@/interfaces/IAuthService';
import { BaseController } from '@/controllers/BaseController';
import { ValidationError } from '@/utils/validation';

/**
 * Authentication Controller
 * 
 * Handles HTTP requests for user authentication and authorization
 * Provides REST API endpoints for login, registration, and user management
 * 
 * Single Responsibility: Handle authentication HTTP requests
 * Open/Closed: Extensible for additional auth endpoints
 * Liskov Substitution: Uses standard Express interfaces
 * Interface Segregation: Focused on auth HTTP handling
 * Dependency Inversion: Uses injected auth service
 */

export class AuthController extends BaseController {
  constructor(private authService: IAuthService) {
    super();
  }

  /**
   * User login
   * POST /api/v1/auth/login
   * Body: { email: string, password: string, rememberMe?: boolean }
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, rememberMe } = req.body;

      if (!email || !password) {
        throw new ValidationError('Email and password are required');
      }

      const credentials: LoginCredentials = {
        email,
        password,
        rememberMe: rememberMe || false
      };

      const result = await this.authService.login(credentials);

      if (!result.success) {
        res.status(401).json({
          success: false,
          message: result.message || 'Authentication failed'
        });
        return;
      }

      // Set HTTP-only cookie for refresh token
      if (result.tokens) {
        res.cookie('refreshToken', result.tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000 // 30 days or 24 hours
        });
      }

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: result.user,
          accessToken: result.tokens?.accessToken,
          expiresAt: result.tokens?.expiresAt
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * User registration
   * POST /api/v1/auth/register
   * Body: { email: string, password: string, username: string, firstName: string, lastName: string }
   */
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, username, firstName, lastName } = req.body;

      if (!email || !password || !username || !firstName || !lastName) {
        throw new ValidationError('All fields are required');
      }

      const userData: RegisterData = {
        email,
        password,
        username,
        firstName,
        lastName
      };

      const result = await this.authService.register(userData);

      if (!result.success) {
        res.status(400).json({
          success: false,
          message: result.message || 'Registration failed'
        });
        return;
      }

      res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: {
          user: result.user
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * User logout
   * POST /api/v1/auth/logout
   * Body: { sessionId?: string }
   */
  async logout(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      const { sessionId } = req.body;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Not authenticated'
        });
        return;
      }

      const success = await this.authService.logout(user.id, sessionId);

      if (success) {
        // Clear refresh token cookie
        res.clearCookie('refreshToken');

        res.json({
          success: true,
          message: 'Logout successful'
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Logout failed'
        });
      }
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Refresh access token
   * POST /api/v1/auth/refresh
   */
  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

      if (!refreshToken) {
        res.status(401).json({
          success: false,
          message: 'Refresh token required'
        });
        return;
      }

      const result = await this.authService.refreshToken(refreshToken);

      if (!result.success) {
        res.clearCookie('refreshToken');
        res.status(401).json({
          success: false,
          message: result.message || 'Token refresh failed'
        });
        return;
      }

      // Update refresh token cookie
      if (result.tokens) {
        res.cookie('refreshToken', result.tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        });
      }

      res.json({
        success: true,
        message: 'Token refreshed',
        data: {
          user: result.user,
          accessToken: result.tokens?.accessToken,
          expiresAt: result.tokens?.expiresAt
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get current user profile
   * GET /api/v1/auth/me
   */
  async getCurrentUser(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Not authenticated'
        });
        return;
      }

      // Get fresh user data
      const freshUser = await this.authService.getUserById(user.id);

      if (!freshUser) {
        res.status(404).json({
          success: false,
          message: 'User not found'
        });
        return;
      }

      res.json({
        success: true,
        data: {
          user: freshUser.toSafeJSON()
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Update user profile
   * PATCH /api/v1/auth/profile
   * Body: { firstName?: string, lastName?: string }
   */
  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      const { firstName, lastName } = req.body;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Not authenticated'
        });
        return;
      }

      const updateData: any = {};
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;

      if (Object.keys(updateData).length === 0) {
        throw new ValidationError('No update data provided');
      }

      const updatedUser = await this.authService.updateUser(user.id, updateData);

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: updatedUser.toSafeJSON()
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Change password
   * POST /api/v1/auth/change-password
   * Body: { currentPassword: string, newPassword: string }
   */
  async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      const { currentPassword, newPassword } = req.body;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Not authenticated'
        });
        return;
      }

      if (!currentPassword || !newPassword) {
        throw new ValidationError('Current password and new password are required');
      }

      const success = await this.authService.changePassword(user.id, currentPassword, newPassword);

      if (success) {
        res.json({
          success: true,
          message: 'Password changed successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Password change failed'
        });
      }
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Request password reset
   * POST /api/v1/auth/forgot-password
   * Body: { email: string }
   */
  async requestPasswordReset(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      if (!email) {
        throw new ValidationError('Email is required');
      }

      await this.authService.requestPasswordReset(email);

      // Always return success to prevent email enumeration
      res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent'
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Reset password with token
   * POST /api/v1/auth/reset-password
   * Body: { token: string, newPassword: string }
   */
  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        throw new ValidationError('Token and new password are required');
      }

      const success = await this.authService.resetPassword({ token, newPassword });

      if (success) {
        res.json({
          success: true,
          message: 'Password reset successful'
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Password reset failed'
        });
      }
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Verify email address
   * POST /api/v1/auth/verify-email
   * Body: { token: string }
   */
  async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.body;

      if (!token) {
        throw new ValidationError('Verification token is required');
      }

      const success = await this.authService.verifyEmail(token);

      if (success) {
        res.json({
          success: true,
          message: 'Email verified successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Email verification failed'
        });
      }
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get user sessions
   * GET /api/v1/auth/sessions
   */
  async getUserSessions(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Not authenticated'
        });
        return;
      }

      const sessions = await this.authService.getUserSessions(user.id);
      const safeSessions = sessions.map(session => session.toSafeJSON());

      res.json({
        success: true,
        data: {
          sessions: safeSessions
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Revoke session
   * DELETE /api/v1/auth/sessions/:sessionId
   */
  async revokeSession(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      const { sessionId } = req.params;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Not authenticated'
        });
        return;
      }

      if (!sessionId) {
        throw new ValidationError('Session ID is required');
      }

      const success = await this.authService.revokeSession(sessionId);

      if (success) {
        res.json({
          success: true,
          message: 'Session revoked successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Revoke all sessions
   * DELETE /api/v1/auth/sessions
   */
  async revokeAllSessions(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Not authenticated'
        });
        return;
      }

      const revokedCount = await this.authService.revokeAllSessions(user.id);

      res.json({
        success: true,
        message: `${revokedCount} session(s) revoked successfully`,
        data: {
          revokedCount
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Check permission
   * POST /api/v1/auth/check-permission
   * Body: { resource: string, action: string }
   */
  async checkPermission(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      const { resource, action } = req.body;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Not authenticated'
        });
        return;
      }

      if (!resource || !action) {
        throw new ValidationError('Resource and action are required');
      }

      const hasPermission = await this.authService.hasPermission(user.id, resource, action);

      res.json({
        success: true,
        data: {
          hasPermission,
          resource,
          action
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get user permissions
   * GET /api/v1/auth/permissions
   */
  async getUserPermissions(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Not authenticated'
        });
        return;
      }

      const permissions = await this.authService.getUserPermissions(user.id);

      res.json({
        success: true,
        data: {
          permissions: permissions.map(p => ({
            id: p.id,
            name: p.name,
            resource: p.resource,
            action: p.action,
            description: p.description
          }))
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get authentication statistics (admin only)
   * GET /api/v1/auth/stats
   */
  async getAuthStats(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Not authenticated'
        });
        return;
      }

      // Check if user has admin permissions
      const hasPermission = await this.authService.hasPermission(user.id, 'user', 'read');
      if (!hasPermission) {
        res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
        return;
      }

      const stats = await this.authService.getAuthStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }
}
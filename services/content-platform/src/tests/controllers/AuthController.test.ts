import { Request, Response } from 'express';
import { AuthController } from '@/controllers/AuthController';
import { IAuthService, AuthResult } from '@/interfaces/IAuthService';
import { ValidationError } from '@/utils/validation';

// Mock the auth service
const mockAuthService: jest.Mocked<IAuthService> = {
  login: jest.fn(),
  register: jest.fn(),
  logout: jest.fn(),
  refreshToken: jest.fn(),
  verifyToken: jest.fn(),
  getUserById: jest.fn(),
  getUserByEmail: jest.fn(),
  updateUser: jest.fn(),
  changePassword: jest.fn(),
  requestPasswordReset: jest.fn(),
  resetPassword: jest.fn(),
  verifyEmail: jest.fn(),
  hasPermission: jest.fn(),
  getUserPermissions: jest.fn(),
  getUserSessions: jest.fn(),
  revokeSession: jest.fn(),
  revokeAllSessions: jest.fn(),
  getAuthStats: jest.fn()
};

describe('AuthController', () => {
  let authController: AuthController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseJson: jest.Mock;
  let responseStatus: jest.Mock;
  let responseCookie: jest.Mock;
  let responseClearCookie: jest.Mock;

  beforeEach(() => {
    responseJson = jest.fn().mockReturnThis();
    responseStatus = jest.fn().mockReturnThis();
    responseCookie = jest.fn().mockReturnThis();
    responseClearCookie = jest.fn().mockReturnThis();

    mockResponse = {
      json: responseJson,
      status: responseStatus,
      cookie: responseCookie,
      clearCookie: responseClearCookie
    };

    mockRequest = {
      body: {},
      params: {},
      cookies: {}
    };

    authController = new AuthController(mockAuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /login', () => {
    it('should login user with valid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'TestPassword123!',
        rememberMe: false
      };

      const authResult: AuthResult = {
        success: true,
        user: { id: 'user-1', email: loginData.email } as any,
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: new Date(),
          tokenType: 'Bearer'
        }
      };

      mockRequest.body = loginData;
      mockAuthService.login.mockResolvedValue(authResult);

      await authController.login(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.login).toHaveBeenCalledWith({
        email: loginData.email,
        password: loginData.password,
        rememberMe: false
      });

      expect(responseCookie).toHaveBeenCalledWith(
        'refreshToken',
        authResult.tokens!.refreshToken,
        expect.objectContaining({
          httpOnly: true,
          secure: false, // NODE_ENV not set to production
          sameSite: 'strict'
        })
      );

      expect(responseJson).toHaveBeenCalledWith({
        success: true,
        message: 'Login successful',
        data: {
          user: authResult.user,
          accessToken: authResult.tokens!.accessToken,
          expiresAt: authResult.tokens!.expiresAt
        }
      });
    });

    it('should reject login with missing credentials', async () => {
      mockRequest.body = { email: 'test@example.com' }; // missing password

      await authController.login(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Email and password are required')
      });
      expect(mockAuthService.login).not.toHaveBeenCalled();
    });

    it('should reject login with invalid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'WrongPassword'
      };

      const authResult: AuthResult = {
        success: false,
        message: 'Invalid email or password'
      };

      mockRequest.body = loginData;
      mockAuthService.login.mockResolvedValue(authResult);

      await authController.login(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid email or password'
      });
    });
  });

  describe('POST /register', () => {
    it('should register user with valid data', async () => {
      const registerData = {
        email: 'test@example.com',
        password: 'TestPassword123!',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User'
      };

      const authResult: AuthResult = {
        success: true,
        user: { id: 'user-1', email: registerData.email } as any,
        message: 'Registration successful'
      };

      mockRequest.body = registerData;
      mockAuthService.register.mockResolvedValue(authResult);

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.register).toHaveBeenCalledWith(registerData);
      expect(responseStatus).toHaveBeenCalledWith(201);
      expect(responseJson).toHaveBeenCalledWith({
        success: true,
        message: 'Registration successful',
        data: {
          user: authResult.user
        }
      });
    });

    it('should reject registration with missing fields', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'TestPassword123!'
        // missing username, firstName, lastName
      };

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('All fields are required')
      });
      expect(mockAuthService.register).not.toHaveBeenCalled();
    });

    it('should reject registration when service fails', async () => {
      const registerData = {
        email: 'existing@example.com',
        password: 'TestPassword123!',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User'
      };

      const authResult: AuthResult = {
        success: false,
        message: 'Email already registered'
      };

      mockRequest.body = registerData;
      mockAuthService.register.mockResolvedValue(authResult);

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Email already registered'
      });
    });
  });

  describe('POST /logout', () => {
    it('should logout user successfully', async () => {
      const mockUser = { id: 'user-1' };
      (mockRequest as any).user = mockUser;
      mockRequest.body = {};

      mockAuthService.logout.mockResolvedValue(true);

      await authController.logout(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.logout).toHaveBeenCalledWith('user-1', undefined);
      expect(responseClearCookie).toHaveBeenCalledWith('refreshToken');
      expect(responseJson).toHaveBeenCalledWith({
        success: true,
        message: 'Logout successful'
      });
    });

    it('should logout specific session', async () => {
      const mockUser = { id: 'user-1' };
      const sessionId = 'session-1';
      (mockRequest as any).user = mockUser;
      mockRequest.body = { sessionId };

      mockAuthService.logout.mockResolvedValue(true);

      await authController.logout(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.logout).toHaveBeenCalledWith('user-1', sessionId);
    });

    it('should require authentication for logout', async () => {
      (mockRequest as any).user = null;

      await authController.logout(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Not authenticated'
      });
    });
  });

  describe('POST /refresh', () => {
    it('should refresh token with valid refresh token', async () => {
      const refreshToken = 'valid-refresh-token';
      mockRequest.cookies = { refreshToken };

      const authResult: AuthResult = {
        success: true,
        user: { id: 'user-1' } as any,
        tokens: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresAt: new Date(),
          tokenType: 'Bearer'
        }
      };

      mockAuthService.refreshToken.mockResolvedValue(authResult);

      await authController.refreshToken(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.refreshToken).toHaveBeenCalledWith(refreshToken);
      expect(responseCookie).toHaveBeenCalledWith(
        'refreshToken',
        authResult.tokens!.refreshToken,
        expect.any(Object)
      );
      expect(responseJson).toHaveBeenCalledWith({
        success: true,
        message: 'Token refreshed',
        data: {
          user: authResult.user,
          accessToken: authResult.tokens!.accessToken,
          expiresAt: authResult.tokens!.expiresAt
        }
      });
    });

    it('should reject refresh without token', async () => {
      mockRequest.cookies = {};
      mockRequest.body = {};

      await authController.refreshToken(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Refresh token required'
      });
    });

    it('should reject invalid refresh token', async () => {
      const refreshToken = 'invalid-refresh-token';
      mockRequest.cookies = { refreshToken };

      const authResult: AuthResult = {
        success: false,
        message: 'Token refresh failed'
      };

      mockAuthService.refreshToken.mockResolvedValue(authResult);

      await authController.refreshToken(mockRequest as Request, mockResponse as Response);

      expect(responseClearCookie).toHaveBeenCalledWith('refreshToken');
      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Token refresh failed'
      });
    });
  });

  describe('GET /me', () => {
    it('should return current user profile', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        toSafeJSON: jest.fn().mockReturnValue({ id: 'user-1', email: 'test@example.com' })
      };
      (mockRequest as any).user = mockUser;

      mockAuthService.getUserById.mockResolvedValue(mockUser as any);

      await authController.getCurrentUser(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.getUserById).toHaveBeenCalledWith('user-1');
      expect(responseJson).toHaveBeenCalledWith({
        success: true,
        data: {
          user: { id: 'user-1', email: 'test@example.com' }
        }
      });
    });

    it('should require authentication', async () => {
      (mockRequest as any).user = null;

      await authController.getCurrentUser(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Not authenticated'
      });
    });
  });

  describe('PATCH /profile', () => {
    it('should update user profile', async () => {
      const mockUser = { id: 'user-1' };
      const updateData = {
        firstName: 'Updated',
        lastName: 'Name'
      };
      const updatedUser = {
        id: 'user-1',
        firstName: 'Updated',
        lastName: 'Name',
        toSafeJSON: jest.fn().mockReturnValue({ id: 'user-1', firstName: 'Updated', lastName: 'Name' })
      };

      (mockRequest as any).user = mockUser;
      mockRequest.body = updateData;

      mockAuthService.updateUser.mockResolvedValue(updatedUser as any);

      await authController.updateProfile(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.updateUser).toHaveBeenCalledWith('user-1', updateData);
      expect(responseJson).toHaveBeenCalledWith({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: { id: 'user-1', firstName: 'Updated', lastName: 'Name' }
        }
      });
    });

    it('should reject update with no data', async () => {
      const mockUser = { id: 'user-1' };
      (mockRequest as any).user = mockUser;
      mockRequest.body = {};

      await authController.updateProfile(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('No update data provided')
      });
    });
  });

  describe('POST /change-password', () => {
    it('should change password successfully', async () => {
      const mockUser = { id: 'user-1' };
      const passwordData = {
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewPassword123!'
      };

      (mockRequest as any).user = mockUser;
      mockRequest.body = passwordData;

      mockAuthService.changePassword.mockResolvedValue(true);

      await authController.changePassword(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.changePassword).toHaveBeenCalledWith(
        'user-1',
        passwordData.currentPassword,
        passwordData.newPassword
      );
      expect(responseJson).toHaveBeenCalledWith({
        success: true,
        message: 'Password changed successfully'
      });
    });

    it('should reject password change with missing data', async () => {
      const mockUser = { id: 'user-1' };
      (mockRequest as any).user = mockUser;
      mockRequest.body = { currentPassword: 'test' }; // missing newPassword

      await authController.changePassword(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Current password and new password are required')
      });
    });
  });

  describe('POST /forgot-password', () => {
    it('should request password reset', async () => {
      const email = 'test@example.com';
      mockRequest.body = { email };

      mockAuthService.requestPasswordReset.mockResolvedValue(true);

      await authController.requestPasswordReset(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.requestPasswordReset).toHaveBeenCalledWith(email);
      expect(responseJson).toHaveBeenCalledWith({
        success: true,
        message: 'If the email exists, a password reset link has been sent'
      });
    });

    it('should reject request without email', async () => {
      mockRequest.body = {};

      await authController.requestPasswordReset(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Email is required')
      });
    });
  });

  describe('POST /reset-password', () => {
    it('should reset password with valid token', async () => {
      const resetData = {
        token: 'valid-reset-token',
        newPassword: 'NewPassword123!'
      };
      mockRequest.body = resetData;

      mockAuthService.resetPassword.mockResolvedValue(true);

      await authController.resetPassword(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.resetPassword).toHaveBeenCalledWith(resetData);
      expect(responseJson).toHaveBeenCalledWith({
        success: true,
        message: 'Password reset successful'
      });
    });

    it('should reject reset with missing data', async () => {
      mockRequest.body = { token: 'test' }; // missing newPassword

      await authController.resetPassword(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Token and new password are required')
      });
    });
  });

  describe('GET /sessions', () => {
    it('should return user sessions', async () => {
      const mockUser = { id: 'user-1' };
      const mockSessions = [
        { id: 'session-1', toSafeJSON: jest.fn().mockReturnValue({ id: 'session-1' }) },
        { id: 'session-2', toSafeJSON: jest.fn().mockReturnValue({ id: 'session-2' }) }
      ];

      (mockRequest as any).user = mockUser;
      mockAuthService.getUserSessions.mockResolvedValue(mockSessions as any);

      await authController.getUserSessions(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.getUserSessions).toHaveBeenCalledWith('user-1');
      expect(responseJson).toHaveBeenCalledWith({
        success: true,
        data: {
          sessions: [{ id: 'session-1' }, { id: 'session-2' }]
        }
      });
    });
  });

  describe('DELETE /sessions/:sessionId', () => {
    it('should revoke specific session', async () => {
      const mockUser = { id: 'user-1' };
      const sessionId = 'session-1';

      (mockRequest as any).user = mockUser;
      mockRequest.params = { sessionId };

      mockAuthService.revokeSession.mockResolvedValue(true);

      await authController.revokeSession(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.revokeSession).toHaveBeenCalledWith(sessionId);
      expect(responseJson).toHaveBeenCalledWith({
        success: true,
        message: 'Session revoked successfully'
      });
    });

    it('should handle non-existent session', async () => {
      const mockUser = { id: 'user-1' };
      const sessionId = 'non-existent';

      (mockRequest as any).user = mockUser;
      mockRequest.params = { sessionId };

      mockAuthService.revokeSession.mockResolvedValue(false);

      await authController.revokeSession(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(404);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Session not found'
      });
    });
  });

  describe('DELETE /sessions', () => {
    it('should revoke all user sessions', async () => {
      const mockUser = { id: 'user-1' };
      (mockRequest as any).user = mockUser;

      mockAuthService.revokeAllSessions.mockResolvedValue(3);

      await authController.revokeAllSessions(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.revokeAllSessions).toHaveBeenCalledWith('user-1');
      expect(responseJson).toHaveBeenCalledWith({
        success: true,
        message: '3 session(s) revoked successfully',
        data: {
          revokedCount: 3
        }
      });
    });
  });

  describe('POST /check-permission', () => {
    it('should check user permission', async () => {
      const mockUser = { id: 'user-1' };
      const permissionData = {
        resource: 'content',
        action: 'read'
      };

      (mockRequest as any).user = mockUser;
      mockRequest.body = permissionData;

      mockAuthService.hasPermission.mockResolvedValue(true);

      await authController.checkPermission(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.hasPermission).toHaveBeenCalledWith('user-1', 'content', 'read');
      expect(responseJson).toHaveBeenCalledWith({
        success: true,
        data: {
          hasPermission: true,
          resource: 'content',
          action: 'read'
        }
      });
    });
  });

  describe('GET /permissions', () => {
    it('should return user permissions', async () => {
      const mockUser = { id: 'user-1' };
      const mockPermissions = [
        { id: '1', name: 'read_content', resource: 'content', action: 'read', description: 'Read content' }
      ];

      (mockRequest as any).user = mockUser;
      mockAuthService.getUserPermissions.mockResolvedValue(mockPermissions as any);

      await authController.getUserPermissions(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.getUserPermissions).toHaveBeenCalledWith('user-1');
      expect(responseJson).toHaveBeenCalledWith({
        success: true,
        data: {
          permissions: [
            {
              id: '1',
              name: 'read_content',
              resource: 'content',
              action: 'read',
              description: 'Read content'
            }
          ]
        }
      });
    });
  });

  describe('GET /stats', () => {
    it('should return auth stats for admin user', async () => {
      const mockUser = { id: 'user-1' };
      const mockStats = {
        totalUsers: 100,
        activeUsers: 85,
        activeSessions: 45,
        loginAttempts24h: 120,
        failedAttempts24h: 5
      };

      (mockRequest as any).user = mockUser;
      mockAuthService.hasPermission.mockResolvedValue(true);
      mockAuthService.getAuthStats.mockResolvedValue(mockStats);

      await authController.getAuthStats(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.hasPermission).toHaveBeenCalledWith('user-1', 'user', 'read');
      expect(mockAuthService.getAuthStats).toHaveBeenCalled();
      expect(responseJson).toHaveBeenCalledWith({
        success: true,
        data: mockStats
      });
    });

    it('should reject stats request for non-admin user', async () => {
      const mockUser = { id: 'user-1' };
      (mockRequest as any).user = mockUser;

      mockAuthService.hasPermission.mockResolvedValue(false);

      await authController.getAuthStats(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Insufficient permissions'
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors properly', async () => {
      const loginData = {
        email: 'invalid-email',
        password: 'weak'
      };

      mockRequest.body = loginData;
      mockAuthService.login.mockRejectedValue(new ValidationError('Invalid email format'));

      await authController.login(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid email format'
      });
    });

    it('should handle generic errors', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'TestPassword123!'
      };

      mockRequest.body = loginData;
      mockAuthService.login.mockRejectedValue(new Error('Database connection failed'));

      await authController.login(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(500);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Internal server error'
      });
    });
  });
});
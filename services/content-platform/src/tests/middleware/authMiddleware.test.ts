import { Request, Response, NextFunction } from 'express';
import { AuthMiddleware } from '@/middleware/authMiddleware';
import { IAuthService } from '@/interfaces/IAuthService';
import { User } from '@/models/User';

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

describe('AuthMiddleware', () => {
  let authMiddleware: AuthMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let responseJson: jest.Mock;
  let responseStatus: jest.Mock;
  let responseHeader: jest.Mock;
  let responseSendStatus: jest.Mock;

  beforeEach(() => {
    responseJson = jest.fn().mockReturnThis();
    responseStatus = jest.fn().mockReturnThis();
    responseHeader = jest.fn().mockReturnThis();
    responseSendStatus = jest.fn().mockReturnThis();
    mockNext = jest.fn();

    mockResponse = {
      json: responseJson,
      status: responseStatus,
      header: responseHeader,
      sendStatus: responseSendStatus
    };

    mockRequest = {
      headers: {},
      query: {},
      connection: { remoteAddress: '127.0.0.1' }
    };

    authMiddleware = new AuthMiddleware(mockAuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticate middleware', () => {
    it('should authenticate user with valid token', async () => {
      const token = 'valid-token';
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        isActive: true
      } as User;

      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };

      mockAuthService.verifyToken.mockResolvedValue(mockUser);

      await authMiddleware.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith(token);
      expect((mockRequest as any).user).toBe(mockUser);
      expect(mockNext).toHaveBeenCalled();
      expect(responseStatus).not.toHaveBeenCalled();
    });

    it('should reject request without authorization header', async () => {
      mockRequest.headers = {};

      await authMiddleware.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token format', async () => {
      mockRequest.headers = {
        authorization: 'InvalidFormat token'
      };

      await authMiddleware.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required'
      });
    });

    it('should reject request with invalid token', async () => {
      const token = 'invalid-token';
      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };

      mockAuthService.verifyToken.mockResolvedValue(null);

      await authMiddleware.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid or expired token'
      });
    });

    it('should reject request for inactive user', async () => {
      const token = 'valid-token';
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        isActive: false
      } as User;

      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };

      mockAuthService.verifyToken.mockResolvedValue(mockUser);

      await authMiddleware.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Account is disabled'
      });
    });

    it('should extract token from query parameter', async () => {
      const token = 'valid-token';
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        isActive: true
      } as User;

      mockRequest.query = { token };
      mockAuthService.verifyToken.mockResolvedValue(mockUser);

      await authMiddleware.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith(token);
      expect((mockRequest as any).user).toBe(mockUser);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('optionalAuth middleware', () => {
    it('should add user to request if token is valid', async () => {
      const token = 'valid-token';
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        isActive: true
      } as User;

      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };

      mockAuthService.verifyToken.mockResolvedValue(mockUser);

      await authMiddleware.optionalAuth(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect((mockRequest as any).user).toBe(mockUser);
      expect(mockNext).toHaveBeenCalled();
      expect(responseStatus).not.toHaveBeenCalled();
    });

    it('should continue without user if no token provided', async () => {
      mockRequest.headers = {};

      await authMiddleware.optionalAuth(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect((mockRequest as any).user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
      expect(responseStatus).not.toHaveBeenCalled();
    });

    it('should continue without user if token is invalid', async () => {
      const token = 'invalid-token';
      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };

      mockAuthService.verifyToken.mockResolvedValue(null);

      await authMiddleware.optionalAuth(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect((mockRequest as any).user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
      expect(responseStatus).not.toHaveBeenCalled();
    });
  });

  describe('requirePermission middleware', () => {
    it('should allow request with required permission', async () => {
      const mockUser = { id: 'user-1' };
      (mockRequest as any).user = mockUser;

      mockAuthService.hasPermission.mockResolvedValue(true);

      const middleware = authMiddleware.requirePermission('content', 'read');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockAuthService.hasPermission).toHaveBeenCalledWith('user-1', 'content', 'read');
      expect(mockNext).toHaveBeenCalled();
      expect(responseStatus).not.toHaveBeenCalled();
    });

    it('should reject request without required permission', async () => {
      const mockUser = { id: 'user-1' };
      (mockRequest as any).user = mockUser;

      mockAuthService.hasPermission.mockResolvedValue(false);

      const middleware = authMiddleware.requirePermission('content', 'delete');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Insufficient permissions. Required: content:delete'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request without authentication', async () => {
      (mockRequest as any).user = null;

      const middleware = authMiddleware.requirePermission('content', 'read');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required'
      });
    });
  });

  describe('requireAnyPermission middleware', () => {
    it('should allow request with any of the required permissions', async () => {
      const mockUser = { id: 'user-1' };
      (mockRequest as any).user = mockUser;

      mockAuthService.hasPermission
        .mockResolvedValueOnce(false) // content:delete
        .mockResolvedValueOnce(true);  // content:update

      const permissions = [
        { resource: 'content', action: 'delete' },
        { resource: 'content', action: 'update' }
      ];

      const middleware = authMiddleware.requireAnyPermission(permissions);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(responseStatus).not.toHaveBeenCalled();
    });

    it('should reject request without any required permissions', async () => {
      const mockUser = { id: 'user-1' };
      (mockRequest as any).user = mockUser;

      mockAuthService.hasPermission.mockResolvedValue(false);

      const permissions = [
        { resource: 'content', action: 'delete' },
        { resource: 'content', action: 'update' }
      ];

      const middleware = authMiddleware.requireAnyPermission(permissions);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Insufficient permissions. Required any of: content:delete, content:update'
      });
    });
  });

  describe('requireAdmin middleware', () => {
    it('should allow request for admin user', async () => {
      const mockUser = {
        id: 'user-1',
        isAdmin: jest.fn().mockReturnValue(true)
      };
      (mockRequest as any).user = mockUser;

      await authMiddleware.requireAdmin(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockUser.isAdmin).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
      expect(responseStatus).not.toHaveBeenCalled();
    });

    it('should reject request for non-admin user', async () => {
      const mockUser = {
        id: 'user-1',
        isAdmin: jest.fn().mockReturnValue(false)
      };
      (mockRequest as any).user = mockUser;

      await authMiddleware.requireAdmin(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Admin access required'
      });
    });
  });

  describe('requireOwnership middleware', () => {
    it('should allow access to own resource', async () => {
      const mockUser = {
        id: 'user-1',
        isAdmin: jest.fn().mockReturnValue(false)
      };
      (mockRequest as any).user = mockUser;
      mockRequest.params = { userId: 'user-1' };

      const middleware = authMiddleware.requireOwnership('userId');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(responseStatus).not.toHaveBeenCalled();
    });

    it('should allow admin access to any resource', async () => {
      const mockUser = {
        id: 'user-1',
        isAdmin: jest.fn().mockReturnValue(true)
      };
      (mockRequest as any).user = mockUser;
      mockRequest.params = { userId: 'user-2' };

      const middleware = authMiddleware.requireOwnership('userId');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(responseStatus).not.toHaveBeenCalled();
    });

    it('should reject access to other users resource', async () => {
      const mockUser = {
        id: 'user-1',
        isAdmin: jest.fn().mockReturnValue(false)
      };
      (mockRequest as any).user = mockUser;
      mockRequest.params = { userId: 'user-2' };

      const middleware = authMiddleware.requireOwnership('userId');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Access denied. You can only access your own resources.'
      });
    });

    it('should reject request without user ID parameter', async () => {
      const mockUser = { id: 'user-1' };
      (mockRequest as any).user = mockUser;
      mockRequest.params = {};

      const middleware = authMiddleware.requireOwnership('userId');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'User ID parameter required'
      });
    });
  });

  describe('requireEmailVerified middleware', () => {
    it('should allow request for verified user', async () => {
      const mockUser = {
        id: 'user-1',
        emailVerified: true
      };
      (mockRequest as any).user = mockUser;

      await authMiddleware.requireEmailVerified(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(responseStatus).not.toHaveBeenCalled();
    });

    it('should reject request for unverified user', async () => {
      const mockUser = {
        id: 'user-1',
        emailVerified: false
      };
      (mockRequest as any).user = mockUser;

      await authMiddleware.requireEmailVerified(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Email verification required'
      });
    });
  });

  describe('rateLimitAuth middleware', () => {
    it('should allow requests under rate limit', () => {
      const rateLimiter = authMiddleware.rateLimitAuth(5, 60000);
      
      rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(responseStatus).not.toHaveBeenCalled();
    });

    it('should block requests over rate limit', () => {
      const rateLimiter = authMiddleware.rateLimitAuth(1, 60000);
      
      // Mock res.send to simulate status 401 response
      const mockSend = jest.fn();
      mockResponse.send = mockSend;
      
      // First request should pass
      rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
      
      // Simulate failed auth attempt
      mockSend({ success: false });
      responseStatus.mockReturnValue({ statusCode: 401 });
      
      // Second request should be blocked
      rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(responseStatus).toHaveBeenCalledWith(429);
    });
  });

  describe('corsAuth middleware', () => {
    it('should set CORS headers for allowed origins', () => {
      mockRequest.headers = { origin: 'http://localhost:3000' };
      process.env.ALLOWED_ORIGINS = 'http://localhost:3000,https://example.com';

      authMiddleware.corsAuth(mockRequest as Request, mockResponse as Response, mockNext);

      expect(responseHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://localhost:3000');
      expect(responseHeader).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle OPTIONS preflight requests', () => {
      mockRequest.method = 'OPTIONS';

      authMiddleware.corsAuth(mockRequest as Request, mockResponse as Response, mockNext);

      expect(responseSendStatus).toHaveBeenCalledWith(200);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('securityHeaders middleware', () => {
    it('should set security headers', () => {
      authMiddleware.securityHeaders(mockRequest as Request, mockResponse as Response, mockNext);

      expect(responseHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(responseHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(responseHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(responseHeader).toHaveBeenCalledWith('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      expect(responseHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication errors gracefully', async () => {
      const token = 'valid-token';
      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };

      mockAuthService.verifyToken.mockRejectedValue(new Error('Database error'));

      await authMiddleware.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(responseStatus).toHaveBeenCalledWith(500);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication error'
      });
    });

    it('should handle permission check errors gracefully', async () => {
      const mockUser = { id: 'user-1' };
      (mockRequest as any).user = mockUser;

      mockAuthService.hasPermission.mockRejectedValue(new Error('Database error'));

      const middleware = authMiddleware.requirePermission('content', 'read');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(500);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        message: 'Permission check error'
      });
    });
  });

  describe('Client Identification', () => {
    it('should identify client correctly', () => {
      mockRequest.headers = {
        'x-forwarded-for': '192.168.1.100, 10.0.0.1',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };
      mockRequest.connection = { remoteAddress: '127.0.0.1' };

      const rateLimiter = authMiddleware.rateLimitAuth(5, 60000);
      rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      // Should use forwarded IP
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle missing headers gracefully', () => {
      mockRequest.headers = {};
      mockRequest.connection = {};

      const rateLimiter = authMiddleware.rateLimitAuth(5, 60000);
      rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
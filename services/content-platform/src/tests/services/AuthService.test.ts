import { AuthService } from '@/services/AuthService';
import { User } from '@/models/User';
import { UserRole } from '@/models/UserRole';
import { Permission } from '@/models/Permission';
import { AuthSession } from '@/models/AuthSession';
import { Repository } from 'typeorm';
import jwt from 'jsonwebtoken';
import { ValidationError } from '@/utils/validation';

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('@/utils/Logger');

const mockJwt = jwt as jest.Mocked<typeof jwt>;

describe('AuthService', () => {
  let authService: AuthService;
  let mockUserRepository: jest.Mocked<Repository<User>>;
  let mockUserRoleRepository: jest.Mocked<Repository<UserRole>>;
  let mockPermissionRepository: jest.Mocked<Repository<Permission>>;
  let mockAuthSessionRepository: jest.Mocked<Repository<AuthSession>>;

  beforeEach(() => {
    // Create mock repositories
    mockUserRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    } as any;

    mockUserRoleRepository = {
      findOne: jest.fn(),
    } as any;

    mockPermissionRepository = {} as any;

    mockAuthSessionRepository = {
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    } as any;

    // Set environment variables for testing
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

    authService = new AuthService(
      mockUserRepository,
      mockUserRoleRepository,
      mockPermissionRepository,
      mockAuthSessionRepository
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('User Registration', () => {
    it('should register user with valid data', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPassword123!',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User'
      };

      const mockRole = {
        id: 'role-1',
        name: 'user',
        permissions: []
      } as UserRole;

      const mockUser = {
        id: 'user-1',
        email: userData.email,
        username: userData.username,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: mockRole,
        toSafeJSON: jest.fn().mockReturnValue({ id: 'user-1' })
      } as any;

      mockUserRepository.findOne
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce(null); // username check
      mockUserRoleRepository.findOne.mockResolvedValue(mockRole);
      mockUserRepository.save.mockResolvedValue(mockUser);

      const result = await authService.register(userData);

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should reject registration with existing email', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'TestPassword123!',
        username: 'newuser',
        firstName: 'Test',
        lastName: 'User'
      };

      const existingUser = { id: 'existing-user' } as User;
      mockUserRepository.findOne.mockResolvedValueOnce(existingUser);

      const result = await authService.register(userData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Email already registered');
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should reject registration with existing username', async () => {
      const userData = {
        email: 'new@example.com',
        password: 'TestPassword123!',
        username: 'existinguser',
        firstName: 'Test',
        lastName: 'User'
      };

      const existingUser = { id: 'existing-user' } as User;
      mockUserRepository.findOne
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce(existingUser); // username check

      const result = await authService.register(userData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Username already taken');
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should reject registration with invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'TestPassword123!',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User'
      };

      const result = await authService.register(userData);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid email format');
    });

    it('should reject registration with weak password', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'weak',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User'
      };

      const result = await authService.register(userData);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid password');
    });
  });

  describe('User Login', () => {
    it('should login user with valid credentials', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'TestPassword123!',
        rememberMe: false
      };

      const mockUser = {
        id: 'user-1',
        email: credentials.email,
        isActive: true,
        verifyPassword: jest.fn().mockResolvedValue(true),
        updateLastLogin: jest.fn(),
        toSafeJSON: jest.fn().mockReturnValue({ id: 'user-1' })
      } as any;

      const mockSession = {
        id: 'session-1',
        toSafeJSON: jest.fn().mockReturnValue({ id: 'session-1' })
      } as any;

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue(mockUser);
      mockAuthSessionRepository.save.mockResolvedValue(mockSession);
      mockJwt.sign.mockReturnValue('mock-jwt-token' as any);

      const result = await authService.login(credentials);

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.tokens).toBeDefined();
      expect(result.session).toBeDefined();
      expect(mockUser.verifyPassword).toHaveBeenCalledWith(credentials.password);
      expect(mockUser.updateLastLogin).toHaveBeenCalled();
    });

    it('should reject login with invalid email', async () => {
      const credentials = {
        email: 'nonexistent@example.com',
        password: 'TestPassword123!',
        rememberMe: false
      };

      mockUserRepository.findOne.mockResolvedValue(null);

      const result = await authService.login(credentials);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid email or password');
    });

    it('should reject login with wrong password', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'WrongPassword',
        rememberMe: false
      };

      const mockUser = {
        id: 'user-1',
        email: credentials.email,
        isActive: true,
        verifyPassword: jest.fn().mockResolvedValue(false)
      } as any;

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await authService.login(credentials);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid email or password');
    });

    it('should reject login for inactive user', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'TestPassword123!',
        rememberMe: false
      };

      const mockUser = {
        id: 'user-1',
        email: credentials.email,
        isActive: false,
        verifyPassword: jest.fn().mockResolvedValue(true)
      } as any;

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await authService.login(credentials);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Account is disabled');
    });
  });

  describe('Token Operations', () => {
    it('should verify valid token', async () => {
      const token = 'valid-token';
      const decodedToken = {
        userId: 'user-1',
        sessionId: 'session-1'
      };

      const mockUser = {
        id: 'user-1',
        email: 'test@example.com'
      } as User;

      const mockSession = {
        id: 'session-1',
        userId: 'user-1',
        accessToken: token,
        isValid: jest.fn().mockReturnValue(true),
        updateActivity: jest.fn(),
        user: mockUser
      } as any;

      mockJwt.verify.mockReturnValue(decodedToken as any);
      mockAuthSessionRepository.findOne.mockResolvedValue(mockSession);
      mockAuthSessionRepository.save.mockResolvedValue(mockSession);

      const result = await authService.verifyToken(token);

      expect(result).toBe(mockUser);
      expect(mockSession.updateActivity).toHaveBeenCalled();
    });

    it('should reject invalid token', async () => {
      const token = 'invalid-token';

      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = await authService.verifyToken(token);

      expect(result).toBeNull();
    });

    it('should refresh valid refresh token', async () => {
      const refreshToken = 'valid-refresh-token';
      const decodedToken = {
        userId: 'user-1',
        sessionId: 'session-1'
      };

      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        toSafeJSON: jest.fn().mockReturnValue({ id: 'user-1' })
      } as any;

      const mockSession = {
        id: 'session-1',
        userId: 'user-1',
        refreshToken,
        isExpired: jest.fn().mockReturnValue(false),
        updateActivity: jest.fn(),
        user: mockUser,
        toSafeJSON: jest.fn().mockReturnValue({ id: 'session-1' })
      } as any;

      mockJwt.verify.mockReturnValue(decodedToken as any);
      mockJwt.sign.mockReturnValue('new-token' as any);
      mockAuthSessionRepository.findOne.mockResolvedValue(mockSession);
      mockAuthSessionRepository.save.mockResolvedValue(mockSession);

      const result = await authService.refreshToken(refreshToken);

      expect(result.success).toBe(true);
      expect(result.tokens).toBeDefined();
      expect(mockSession.updateActivity).toHaveBeenCalled();
    });

    it('should reject expired refresh token', async () => {
      const refreshToken = 'expired-refresh-token';
      const decodedToken = {
        userId: 'user-1',
        sessionId: 'session-1'
      };

      const mockSession = {
        id: 'session-1',
        userId: 'user-1',
        refreshToken,
        isExpired: jest.fn().mockReturnValue(true)
      } as any;

      mockJwt.verify.mockReturnValue(decodedToken as any);
      mockAuthSessionRepository.findOne.mockResolvedValue(mockSession);

      const result = await authService.refreshToken(refreshToken);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Session expired');
    });
  });

  describe('User Management', () => {
    it('should get user by ID', async () => {
      const userId = 'user-1';
      const mockUser = {
        id: userId,
        email: 'test@example.com'
      } as User;

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await authService.getUserById(userId);

      expect(result).toBe(mockUser);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
        relations: ['role', 'role.permissions']
      });
    });

    it('should get user by email', async () => {
      const email = 'test@example.com';
      const mockUser = {
        id: 'user-1',
        email
      } as User;

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await authService.getUserByEmail(email);

      expect(result).toBe(mockUser);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email: email.toLowerCase() },
        relations: ['role', 'role.permissions']
      });
    });

    it('should update user profile', async () => {
      const userId = 'user-1';
      const updateData = {
        firstName: 'Updated',
        lastName: 'Name'
      };

      const mockUser = {
        id: userId,
        email: 'test@example.com',
        firstName: 'Original',
        lastName: 'Name'
      } as any;

      const updatedUser = {
        ...mockUser,
        ...updateData
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue(updatedUser);

      const result = await authService.updateUser(userId, updateData);

      expect(result.firstName).toBe(updateData.firstName);
      expect(result.lastName).toBe(updateData.lastName);
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should change user password', async () => {
      const userId = 'user-1';
      const currentPassword = 'CurrentPassword123!';
      const newPassword = 'NewPassword123!';

      const mockUser = {
        id: userId,
        verifyPassword: jest.fn().mockResolvedValue(true),
        setPassword: jest.fn()
      } as any;

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue(mockUser);
      mockAuthSessionRepository.update.mockResolvedValue({ affected: 2 } as any);

      const result = await authService.changePassword(userId, currentPassword, newPassword);

      expect(result).toBe(true);
      expect(mockUser.verifyPassword).toHaveBeenCalledWith(currentPassword);
      expect(mockUser.setPassword).toHaveBeenCalledWith(newPassword);
      expect(mockAuthSessionRepository.update).toHaveBeenCalledWith(
        { userId },
        { isActive: false }
      );
    });

    it('should reject password change with wrong current password', async () => {
      const userId = 'user-1';
      const currentPassword = 'WrongPassword';
      const newPassword = 'NewPassword123!';

      const mockUser = {
        id: userId,
        verifyPassword: jest.fn().mockResolvedValue(false)
      } as any;

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await expect(
        authService.changePassword(userId, currentPassword, newPassword)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('Permission Checking', () => {
    it('should check user permission', async () => {
      const userId = 'user-1';
      const resource = 'content';
      const action = 'read';

      const mockUser = {
        id: userId,
        hasPermission: jest.fn().mockReturnValue(true)
      } as any;

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await authService.hasPermission(userId, resource, action);

      expect(result).toBe(true);
      expect(mockUser.hasPermission).toHaveBeenCalledWith(resource, action);
    });

    it('should return false for non-existent user', async () => {
      const userId = 'non-existent';
      const resource = 'content';
      const action = 'read';

      mockUserRepository.findOne.mockResolvedValue(null);

      const result = await authService.hasPermission(userId, resource, action);

      expect(result).toBe(false);
    });

    it('should get user permissions', async () => {
      const userId = 'user-1';
      const mockPermissions = [
        { id: '1', name: 'read_content', resource: 'content', action: 'read' }
      ] as Permission[];

      const mockUser = {
        id: userId,
        role: {
          permissions: mockPermissions
        }
      } as any;

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await authService.getUserPermissions(userId);

      expect(result).toBe(mockPermissions);
    });
  });

  describe('Session Management', () => {
    it('should get user sessions', async () => {
      const userId = 'user-1';
      const mockSessions = [
        { id: 'session-1', userId },
        { id: 'session-2', userId }
      ] as AuthSession[];

      mockAuthSessionRepository.find.mockResolvedValue(mockSessions);

      const result = await authService.getUserSessions(userId);

      expect(result).toBe(mockSessions);
      expect(mockAuthSessionRepository.find).toHaveBeenCalledWith({
        where: { userId, isActive: true },
        order: { lastUsedAt: 'DESC' }
      });
    });

    it('should revoke session', async () => {
      const sessionId = 'session-1';
      const mockSession = {
        id: sessionId,
        revoke: jest.fn()
      } as any;

      mockAuthSessionRepository.findOne.mockResolvedValue(mockSession);
      mockAuthSessionRepository.save.mockResolvedValue(mockSession);

      const result = await authService.revokeSession(sessionId);

      expect(result).toBe(true);
      expect(mockSession.revoke).toHaveBeenCalled();
      expect(mockAuthSessionRepository.save).toHaveBeenCalled();
    });

    it('should revoke all user sessions', async () => {
      const userId = 'user-1';

      mockAuthSessionRepository.update.mockResolvedValue({ affected: 3 } as any);

      const result = await authService.revokeAllSessions(userId);

      expect(result).toBe(3);
      expect(mockAuthSessionRepository.update).toHaveBeenCalledWith(
        { userId, isActive: true },
        { isActive: false }
      );
    });
  });

  describe('Password Reset', () => {
    it('should request password reset', async () => {
      const email = 'test@example.com';
      const mockUser = {
        id: 'user-1',
        email,
        generatePasswordResetToken: jest.fn().mockReturnValue('reset-token')
      } as any;

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue(mockUser);

      const result = await authService.requestPasswordReset(email);

      expect(result).toBe(true);
      expect(mockUser.generatePasswordResetToken).toHaveBeenCalled();
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should reset password with valid token', async () => {
      const resetData = {
        token: 'valid-reset-token',
        newPassword: 'NewPassword123!'
      };

      const mockUser = {
        id: 'user-1',
        verifyPasswordResetToken: jest.fn().mockReturnValue(true),
        setPassword: jest.fn(),
        clearPasswordResetToken: jest.fn()
      } as any;

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue(mockUser);
      mockAuthSessionRepository.update.mockResolvedValue({ affected: 1 } as any);

      const result = await authService.resetPassword(resetData);

      expect(result).toBe(true);
      expect(mockUser.verifyPasswordResetToken).toHaveBeenCalledWith(resetData.token);
      expect(mockUser.setPassword).toHaveBeenCalledWith(resetData.newPassword);
      expect(mockUser.clearPasswordResetToken).toHaveBeenCalled();
    });
  });

  describe('Email Verification', () => {
    it('should verify email with valid token', async () => {
      const token = 'valid-verification-token';
      const mockUser = {
        id: 'user-1',
        verifyEmailVerificationToken: jest.fn().mockReturnValue(true)
      } as any;

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue(mockUser);

      const result = await authService.verifyEmail(token);

      expect(result).toBe(true);
      expect(mockUser.verifyEmailVerificationToken).toHaveBeenCalledWith(token);
    });

    it('should reject invalid verification token', async () => {
      const token = 'invalid-token';

      mockUserRepository.findOne.mockResolvedValue(null);

      const result = await authService.verifyEmail(token);

      expect(result).toBe(false);
    });
  });

  describe('Authentication Statistics', () => {
    it('should get auth stats', async () => {
      mockUserRepository.count
        .mockResolvedValueOnce(100) // total users
        .mockResolvedValueOnce(85);  // active users
      mockAuthSessionRepository.count.mockResolvedValue(45); // active sessions

      const result = await authService.getAuthStats();

      expect(result).toEqual({
        totalUsers: 100,
        activeUsers: 85,
        activeSessions: 45,
        loginAttempts24h: 0,
        failedAttempts24h: 0
      });
    });
  });

  describe('Logout', () => {
    it('should logout specific session', async () => {
      const userId = 'user-1';
      const sessionId = 'session-1';

      const mockSession = {
        id: sessionId,
        userId,
        isActive: true,
        revoke: jest.fn()
      } as any;

      mockAuthSessionRepository.findOne.mockResolvedValue(mockSession);
      mockAuthSessionRepository.save.mockResolvedValue(mockSession);

      const result = await authService.logout(userId, sessionId);

      expect(result).toBe(true);
      expect(mockSession.revoke).toHaveBeenCalled();
    });

    it('should logout all sessions for user', async () => {
      const userId = 'user-1';

      mockAuthSessionRepository.update.mockResolvedValue({ affected: 2 } as any);

      const result = await authService.logout(userId);

      expect(result).toBe(true);
      expect(mockAuthSessionRepository.update).toHaveBeenCalledWith(
        { userId, isActive: true },
        { isActive: false }
      );
    });
  });
});
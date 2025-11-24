import { User } from '@/models/User';
import { UserRole } from '@/models/UserRole';
import { Permission } from '@/models/Permission';
import bcrypt from 'bcrypt';

// Mock bcrypt
jest.mock('bcrypt');
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('User Model', () => {
  let user: User;
  let userRole: UserRole;
  let permissions: Permission[];

  beforeEach(() => {
    // Setup test permissions
    permissions = [
      {
        id: '1',
        name: 'read_content',
        resource: 'content',
        action: 'read',
        description: 'Read content',
        isActive: true,
        isSystem: true,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        roles: []
      },
      {
        id: '2',
        name: 'create_content',
        resource: 'content',
        action: 'create',
        description: 'Create content',
        isActive: true,
        isSystem: true,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        roles: []
      }
    ] as Permission[];

    // Setup test role
    userRole = {
      id: 'role-1',
      name: 'content_manager',
      description: 'Content manager role',
      isActive: true,
      isSystem: false,
      metadata: null,
      permissions,
      users: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      hasPermission: jest.fn(),
      hasResourceAccess: jest.fn(),
      getPermissionStrings: jest.fn(),
      getPermissionsByResource: jest.fn(),
      addPermission: jest.fn(),
      removePermission: jest.fn(),
      getUserCount: jest.fn(),
      isAdminRole: jest.fn(),
      canBeDeleted: jest.fn(),
      getDisplayName: jest.fn()
    } as UserRole;

    // Setup test user
    user = new User();
    user.id = 'test-user-id';
    user.email = 'test@example.com';
    user.username = 'testuser';
    user.firstName = 'Test';
    user.lastName = 'User';
    user.passwordHash = 'hashed-password';
    user.isActive = true;
    user.emailVerified = true;
    user.role = userRole;
    user.sessions = [];
    user.lastLoginAt = null;
    user.emailVerifiedAt = new Date();
    user.emailVerificationToken = null;
    user.passwordResetToken = null;
    user.passwordResetExpiresAt = null;
    user.metadata = null;
    user.createdAt = new Date();
    user.updatedAt = new Date();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Password Management', () => {
    it('should hash password when setPassword is called', async () => {
      const plainPassword = 'testPassword123!';
      const hashedPassword = 'hashed-password-result';
      
      mockBcrypt.hash.mockResolvedValue(hashedPassword as never);

      user.setPassword(plainPassword);
      await user.hashPassword();

      expect(mockBcrypt.hash).toHaveBeenCalledWith(plainPassword, 12);
      expect(user.passwordHash).toBe(hashedPassword);
    });

    it('should verify password correctly', async () => {
      const plainPassword = 'testPassword123!';
      
      mockBcrypt.compare.mockResolvedValue(true as never);

      const isValid = await user.verifyPassword(plainPassword);

      expect(mockBcrypt.compare).toHaveBeenCalledWith(plainPassword, user.passwordHash);
      expect(isValid).toBe(true);
    });

    it('should reject invalid password', async () => {
      const wrongPassword = 'wrongPassword';
      
      mockBcrypt.compare.mockResolvedValue(false as never);

      const isValid = await user.verifyPassword(wrongPassword);

      expect(mockBcrypt.compare).toHaveBeenCalledWith(wrongPassword, user.passwordHash);
      expect(isValid).toBe(false);
    });
  });

  describe('User Information', () => {
    it('should return full name', () => {
      expect(user.getFullName()).toBe('Test User');
    });

    it('should return display name preferring full name', () => {
      expect(user.getDisplayName()).toBe('Test User');
    });

    it('should fallback to username for display name when name is empty', () => {
      user.firstName = '';
      user.lastName = '';
      expect(user.getDisplayName()).toBe('testuser');
    });
  });

  describe('Permission Checking', () => {
    it('should check if user has specific permission', () => {
      userRole.hasPermission = jest.fn().mockReturnValue(true);

      const hasPermission = user.hasPermission('content', 'read');

      expect(userRole.hasPermission).toHaveBeenCalledWith('content', 'read');
      expect(hasPermission).toBe(true);
    });

    it('should check if user has resource access', () => {
      userRole.hasResourceAccess = jest.fn().mockReturnValue(true);

      const hasAccess = user.hasResourceAccess('content');

      expect(userRole.hasResourceAccess).toHaveBeenCalledWith('content');
      expect(hasAccess).toBe(true);
    });

    it('should return false when user has no role', () => {
      user.role = null as any;

      expect(user.hasPermission('content', 'read')).toBe(false);
      expect(user.hasResourceAccess('content')).toBe(false);
    });

    it('should get user permissions', () => {
      userRole.getPermissionStrings = jest.fn().mockReturnValue(['content:read', 'content:create']);

      const permissions = user.getPermissions();

      expect(permissions).toEqual(['content:read', 'content:create']);
    });
  });

  describe('Role-based Access', () => {
    it('should identify admin user', () => {
      userRole.name = 'admin';
      expect(user.isAdmin()).toBe(true);
    });

    it('should identify super admin user', () => {
      userRole.name = 'super_admin';
      expect(user.isAdmin()).toBe(true);
    });

    it('should identify non-admin user', () => {
      userRole.name = 'user';
      expect(user.isAdmin()).toBe(false);
    });

    it('should check content management capability', () => {
      userRole.hasPermission = jest.fn()
        .mockReturnValueOnce(true)   // content:create
        .mockReturnValueOnce(false)  // content:update
        .mockReturnValueOnce(false); // content:delete

      expect(user.canManageContent()).toBe(true);
    });

    it('should check schedule management capability', () => {
      userRole.hasPermission = jest.fn()
        .mockReturnValueOnce(false)  // schedule:create
        .mockReturnValueOnce(true)   // schedule:update
        .mockReturnValueOnce(false); // schedule:delete

      expect(user.canManageSchedules()).toBe(true);
    });

    it('should check analytics viewing capability', () => {
      userRole.hasPermission = jest.fn().mockReturnValue(true);

      expect(user.canViewAnalytics()).toBe(true);
      expect(userRole.hasPermission).toHaveBeenCalledWith('analytics', 'read');
    });
  });

  describe('Email Verification', () => {
    it('should generate email verification token', () => {
      const token = user.generateEmailVerificationToken();

      expect(token).toBeDefined();
      expect(token.length).toBe(64); // 32 bytes * 2 (hex)
      expect(user.emailVerificationToken).toBe(token);
    });

    it('should verify email verification token', () => {
      const token = 'valid-token';
      user.emailVerificationToken = token;
      user.emailVerified = false;

      const isValid = user.verifyEmailVerificationToken(token);

      expect(isValid).toBe(true);
      expect(user.emailVerified).toBe(true);
      expect(user.emailVerifiedAt).toBeDefined();
      expect(user.emailVerificationToken).toBeNull();
    });

    it('should reject invalid email verification token', () => {
      user.emailVerificationToken = 'valid-token';
      user.emailVerified = false;

      const isValid = user.verifyEmailVerificationToken('invalid-token');

      expect(isValid).toBe(false);
      expect(user.emailVerified).toBe(false);
    });

    it('should reject token when email already verified', () => {
      const token = 'valid-token';
      user.emailVerificationToken = token;
      user.emailVerified = true;

      const isValid = user.verifyEmailVerificationToken(token);

      expect(isValid).toBe(false);
    });
  });

  describe('Password Reset', () => {
    it('should generate password reset token', () => {
      const token = user.generatePasswordResetToken();

      expect(token).toBeDefined();
      expect(token.length).toBe(64); // 32 bytes * 2 (hex)
      expect(user.passwordResetToken).toBe(token);
      expect(user.passwordResetExpiresAt).toBeDefined();
    });

    it('should verify valid password reset token', () => {
      const token = 'valid-reset-token';
      user.passwordResetToken = token;
      user.passwordResetExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

      const isValid = user.verifyPasswordResetToken(token);

      expect(isValid).toBe(true);
    });

    it('should reject expired password reset token', () => {
      const token = 'expired-token';
      user.passwordResetToken = token;
      user.passwordResetExpiresAt = new Date(Date.now() - 1000); // 1 second ago

      const isValid = user.verifyPasswordResetToken(token);

      expect(isValid).toBe(false);
      expect(user.passwordResetToken).toBeNull();
      expect(user.passwordResetExpiresAt).toBeNull();
    });

    it('should clear password reset token', () => {
      user.passwordResetToken = 'some-token';
      user.passwordResetExpiresAt = new Date();

      user.clearPasswordResetToken();

      expect(user.passwordResetToken).toBeNull();
      expect(user.passwordResetExpiresAt).toBeNull();
    });
  });

  describe('User Status', () => {
    it('should return active status for active verified user', () => {
      user.isActive = true;
      user.emailVerified = true;

      expect(user.getStatus()).toBe('active');
    });

    it('should return inactive status for inactive user', () => {
      user.isActive = false;
      user.emailVerified = true;

      expect(user.getStatus()).toBe('inactive');
    });

    it('should return unverified status for unverified user', () => {
      user.isActive = true;
      user.emailVerified = false;

      expect(user.getStatus()).toBe('unverified');
    });
  });

  describe('Activity Tracking', () => {
    it('should update last login timestamp', () => {
      const beforeUpdate = user.lastLoginAt;
      
      user.updateLastLogin();

      expect(user.lastLoginAt).toBeDefined();
      expect(user.lastLoginAt).not.toBe(beforeUpdate);
    });
  });

  describe('Safe JSON Conversion', () => {
    it('should exclude sensitive data from JSON', () => {
      user.passwordHash = 'sensitive-hash';
      user.passwordResetToken = 'reset-token';
      user.emailVerificationToken = 'verification-token';

      const safeJson = user.toSafeJSON();

      expect(safeJson).not.toHaveProperty('passwordHash');
      expect(safeJson).not.toHaveProperty('passwordResetToken');
      expect(safeJson).not.toHaveProperty('emailVerificationToken');
      expect(safeJson.email).toBe(user.email);
      expect(safeJson.username).toBe(user.username);
    });
  });

  describe('Validation Methods', () => {
    describe('Email Validation', () => {
      it('should validate correct email formats', () => {
        expect(User.isValidEmail('test@example.com')).toBe(true);
        expect(User.isValidEmail('user.name@domain.co.uk')).toBe(true);
        expect(User.isValidEmail('user+tag@example.org')).toBe(true);
      });

      it('should reject invalid email formats', () => {
        expect(User.isValidEmail('invalid-email')).toBe(false);
        expect(User.isValidEmail('user@')).toBe(false);
        expect(User.isValidEmail('@domain.com')).toBe(false);
        expect(User.isValidEmail('user space@domain.com')).toBe(false);
      });
    });

    describe('Username Validation', () => {
      it('should validate correct username formats', () => {
        expect(User.isValidUsername('user123')).toBe(true);
        expect(User.isValidUsername('user_name')).toBe(true);
        expect(User.isValidUsername('user-name')).toBe(true);
        expect(User.isValidUsername('validUsername123')).toBe(true);
      });

      it('should reject invalid username formats', () => {
        expect(User.isValidUsername('us')).toBe(false); // too short
        expect(User.isValidUsername('user name')).toBe(false); // contains space
        expect(User.isValidUsername('user@name')).toBe(false); // invalid character
        expect(User.isValidUsername('a'.repeat(31))).toBe(false); // too long
      });
    });

    describe('Password Validation', () => {
      it('should validate strong passwords', () => {
        const result = User.isValidPassword('StrongPass123!');
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject passwords that are too short', () => {
        const result = User.isValidPassword('Short1!');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must be at least 8 characters long');
      });

      it('should reject passwords without uppercase letters', () => {
        const result = User.isValidPassword('lowercase123!');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one uppercase letter');
      });

      it('should reject passwords without lowercase letters', () => {
        const result = User.isValidPassword('UPPERCASE123!');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one lowercase letter');
      });

      it('should reject passwords without numbers', () => {
        const result = User.isValidPassword('NoNumbers!');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one number');
      });

      it('should reject passwords without special characters', () => {
        const result = User.isValidPassword('NoSpecialChar123');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one special character');
      });

      it('should return multiple errors for weak passwords', () => {
        const result = User.isValidPassword('weak');
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(1);
      });
    });
  });
});
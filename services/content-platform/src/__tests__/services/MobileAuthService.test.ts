import { MobileAuthService } from '@/services/MobileAuthService';
import { IMobileAuthService, PairingToken, DeviceInfo, PairingValidationResult, SessionCreationResult } from '@/interfaces/IMobileAuthService';
import { Repository } from 'typeorm';
import { PairingToken as PairingTokenEntity } from '@/models/PairingToken';
import { MobileDevice } from '@/models/MobileDevice';
import { RemoteSession } from '@/models/RemoteSession';
import { User } from '@/models/User';

// TDD Phase 1: RED - Write failing tests for Mobile Authentication System
// Following SOLID principles: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion

describe('MobileAuthService (TDD)', () => {
  let mobileAuthService: MobileAuthService;
  let mockPairingTokenRepository: jest.Mocked<Repository<PairingTokenEntity>>;
  let mockDeviceRepository: jest.Mocked<Repository<MobileDevice>>;
  let mockSessionRepository: jest.Mocked<Repository<RemoteSession>>;
  let mockUserRepository: jest.Mocked<Repository<User>>;
  let mockTokenGenerator: any;
  let mockQRCodeService: any;
  let mockLogger: any;

  beforeEach(() => {
    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      getMany: jest.fn().mockResolvedValue([]),
      getCount: jest.fn().mockResolvedValue(0)
    };

    mockPairingTokenRepository = {
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder)
    } as any;

    mockDeviceRepository = {
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    } as any;

    mockSessionRepository = {
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    } as any;

    mockUserRepository = {
      findOne: jest.fn(),
      findOneBy: jest.fn()
    } as any;

    mockTokenGenerator = {
      generatePairingCode: jest.fn(),
      generateSessionToken: jest.fn(),
      generateRefreshToken: jest.fn(),
      validateTokenFormat: jest.fn()
    };

    mockQRCodeService = {
      generateQRCode: jest.fn(),
      encodeDataURL: jest.fn()
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn()
    };

    mobileAuthService = new MobileAuthService(
      mockPairingTokenRepository,
      mockDeviceRepository,
      mockSessionRepository,
      mockUserRepository,
      mockTokenGenerator,
      mockQRCodeService,
      mockLogger
    );
  });

  describe('Pairing Token Generation (Single Responsibility Principle)', () => {
    it('should generate unique pairing code and token for user', async () => {
      // RED: This test will fail because we haven't implemented the method yet
      const userId = 'user-123';
      const deviceInfo: DeviceInfo = {
        name: 'iPhone 15 Pro',
        model: 'iPhone15,3',
        os: 'iOS',
        osVersion: '17.2',
        appVersion: '1.0.0',
        capabilities: ['stream_control', 'pip_control']
      };

      const mockPairingCode = 'ABC123';
      const mockPairingToken = 'pair-token-456';
      const mockQRCode = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...';

      mockTokenGenerator.generatePairingCode.mockReturnValue(mockPairingCode);
      mockTokenGenerator.generateSessionToken.mockReturnValue(mockPairingToken);
      mockQRCodeService.generateQRCode.mockResolvedValue(mockQRCode);

      const mockTokenEntity = {
        id: 'token-789',
        userId,
        code: mockPairingCode,
        token: mockPairingToken,
        deviceInfo,
        expiresAt: new Date(Date.now() + 300000),
        isUsed: false
      };

      mockPairingTokenRepository.create.mockReturnValue(mockTokenEntity as any);
      mockPairingTokenRepository.save.mockResolvedValue(mockTokenEntity as any);

      const result = await mobileAuthService.generatePairingToken(userId, deviceInfo);

      expect(result).toMatchObject({
        code: mockPairingCode,
        token: mockPairingToken,
        expiresAt: expect.any(Date),
        qrCodeDataURL: mockQRCode
      });

      expect(mockPairingTokenRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          code: mockPairingCode,
          token: mockPairingToken,
          userId,
          deviceInfo
        })
      );

      expect(mockQRCodeService.generateQRCode).toHaveBeenCalledWith({
        code: mockPairingCode,
        userId,
        appName: 'LiveAdDetection'
      });
    });

    it('should enforce rate limiting for pairing token generation', async () => {
      // RED: This test will fail
      const userId = 'user-123';
      const deviceInfo = {
        name: 'Test Device',
        model: 'Test Model',
        os: 'iOS' as const,
        osVersion: '17.0',
        appVersion: '1.0.0',
        capabilities: ['stream_control']
      };

      // Mock existing recent tokens to exceed rate limit
      const recentTokens = Array.from({ length: 5 }, (_, i) => ({
        id: `token-${i}`,
        userId,
        createdAt: new Date(Date.now() - 60000), // 1 minute ago
        expiresAt: new Date(Date.now() + 240000), // 4 minutes from now
        isUsed: false
      }));

      mockPairingTokenRepository.find.mockResolvedValue(recentTokens as any);

      await expect(
        mobileAuthService.generatePairingToken(userId, deviceInfo)
      ).rejects.toThrow('Rate limit exceeded. Too many pairing attempts.');

      expect(mockPairingTokenRepository.create).not.toHaveBeenCalled();
    });

    it('should validate device info before generating pairing token', async () => {
      // RED: This test will fail
      const userId = 'user-123';
      const invalidDeviceInfo = {
        name: '', // Invalid: empty name
        model: '',
        os: 'InvalidOS' as any, // Invalid OS
        osVersion: '',
        appVersion: '',
        capabilities: [] // Invalid: no capabilities
      };

      await expect(
        mobileAuthService.generatePairingToken(userId, invalidDeviceInfo)
      ).rejects.toThrow('Invalid device information');

      expect(mockPairingTokenRepository.create).not.toHaveBeenCalled();
    });

    it('should cleanup expired tokens before generating new ones', async () => {
      // RED: This test will fail
      const userId = 'user-123';
      const deviceInfo = {
        name: 'iPhone 15 Pro',
        model: 'iPhone15,3',
        os: 'iOS' as const,
        osVersion: '17.2',
        appVersion: '1.0.0',
        capabilities: ['stream_control']
      };

      const expiredTokens = [
        {
          id: 'expired-1',
          userId,
          expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
          isUsed: false,
          markAsExpired: jest.fn()
        },
        {
          id: 'expired-2',
          userId,
          expiresAt: new Date(Date.now() - 120000), // Expired 2 minutes ago
          isUsed: false,
          markAsExpired: jest.fn()
        }
      ];

      mockPairingTokenRepository.find
        .mockResolvedValueOnce(expiredTokens as any) // For expired tokens cleanup
        .mockResolvedValueOnce([]); // For rate limiting check

      mockTokenGenerator.generatePairingCode.mockReturnValue('ABC123');
      mockTokenGenerator.generateSessionToken.mockReturnValue('token-456');
      
      const mockNewToken = {
        id: 'new-token',
        code: 'ABC123',
        token: 'token-456'
      };
      
      mockPairingTokenRepository.create.mockReturnValue(mockNewToken as any);
      mockPairingTokenRepository.save.mockResolvedValue(mockNewToken as any);
      mockQRCodeService.generateQRCode.mockResolvedValue('qr-code-data');

      await mobileAuthService.generatePairingToken(userId, deviceInfo);

      // Should mark expired tokens as expired
      expect(expiredTokens[0].markAsExpired).toHaveBeenCalled();
      expect(expiredTokens[1].markAsExpired).toHaveBeenCalled();
      
      // Should save the updated expired tokens
      expect(mockPairingTokenRepository.save).toHaveBeenCalledTimes(3); // 2 expired + 1 new
    });
  });

  describe('Pairing Token Validation (Open/Closed Principle)', () => {
    it('should validate pairing code and return device information', async () => {
      // RED: This test will fail
      const pairingCode = 'ABC123';
      const mockToken = {
        id: 'token-456',
        userId: 'user-123',
        code: pairingCode,
        token: 'pair-token-789',
        deviceInfo: {
          name: 'iPhone 15 Pro',
          model: 'iPhone15,3',
          os: 'iOS',
          osVersion: '17.2',
          appVersion: '1.0.0',
          capabilities: ['stream_control', 'pip_control']
        },
        expiresAt: new Date(Date.now() + 240000), // 4 minutes from now
        isUsed: false,
        isExpired: jest.fn().mockReturnValue(false),
        markAsUsed: jest.fn()
      };

      mockPairingTokenRepository.findOne.mockResolvedValue(mockToken as any);

      const result = await mobileAuthService.validatePairingToken(pairingCode);

      expect(result).toMatchObject({
        valid: true,
        userId: 'user-123',
        deviceInfo: mockToken.deviceInfo,
        token: 'pair-token-789'
      });

      expect(mockToken.markAsUsed).toHaveBeenCalled();
      expect(mockPairingTokenRepository.save).toHaveBeenCalledWith(mockToken);
    });

    it('should reject expired pairing codes', async () => {
      // RED: This test will fail
      const expiredCode = 'EXPIRED123';
      const mockExpiredToken = {
        id: 'token-expired',
        code: expiredCode,
        expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
        isUsed: false,
        isExpired: jest.fn().mockReturnValue(true)
      };

      mockPairingTokenRepository.findOne.mockResolvedValue(mockExpiredToken as any);

      const result = await mobileAuthService.validatePairingToken(expiredCode);

      expect(result).toMatchObject({
        valid: false,
        error: 'Pairing code has expired'
      });

      expect(mockExpiredToken.isExpired).toHaveBeenCalled();
    });

    it('should reject already used pairing codes', async () => {
      // RED: This test will fail
      const usedCode = 'USED123';
      const mockUsedToken = {
        id: 'token-used',
        code: usedCode,
        expiresAt: new Date(Date.now() + 240000),
        isUsed: true,
        isExpired: jest.fn().mockReturnValue(false)
      };

      mockPairingTokenRepository.findOne.mockResolvedValue(mockUsedToken as any);

      const result = await mobileAuthService.validatePairingToken(usedCode);

      expect(result).toMatchObject({
        valid: false,
        error: 'Pairing code has already been used'
      });
    });

    it('should reject non-existent pairing codes', async () => {
      // RED: This test will fail
      const nonExistentCode = 'INVALID123';

      mockPairingTokenRepository.findOne.mockResolvedValue(null);

      const result = await mobileAuthService.validatePairingToken(nonExistentCode);

      expect(result).toMatchObject({
        valid: false,
        error: 'Invalid pairing code'
      });
    });

    it('should handle case-insensitive pairing codes', async () => {
      // RED: This test will fail
      const upperCaseCode = 'ABC123';
      const lowerCaseInput = 'abc123';
      
      const mockToken = {
        id: 'token-456',
        userId: 'user-123',
        code: upperCaseCode,
        deviceInfo: { name: 'Test Device' },
        expiresAt: new Date(Date.now() + 240000),
        isUsed: false,
        isExpired: jest.fn().mockReturnValue(false),
        markAsUsed: jest.fn()
      };

      mockPairingTokenRepository.findOne.mockResolvedValue(mockToken as any);

      const result = await mobileAuthService.validatePairingToken(lowerCaseInput);

      expect(result.valid).toBe(true);
      expect(mockPairingTokenRepository.findOne).toHaveBeenCalledWith({
        where: { code: upperCaseCode.toUpperCase() }
      });
    });
  });

  describe('Device Session Creation (Liskov Substitution Principle)', () => {
    it('should create authenticated session for paired device', async () => {
      // RED: This test will fail
      const deviceId = 'device-123';
      const userId = 'user-456';
      const capabilities = ['stream_control', 'pip_control', 'notifications'];

      const mockSessionToken = 'session-token-789';
      const mockRefreshToken = 'refresh-token-abc';

      mockTokenGenerator.generateSessionToken.mockReturnValue(mockSessionToken);
      mockTokenGenerator.generateRefreshToken.mockReturnValue(mockRefreshToken);

      const mockSession = {
        id: 'session-456',
        deviceId,
        userId,
        sessionToken: mockSessionToken,
        refreshToken: mockRefreshToken,
        capabilities,
        expiresAt: new Date(Date.now() + 3600000), // 1 hour
        isActive: true
      };

      mockSessionRepository.create.mockReturnValue(mockSession as any);
      mockSessionRepository.save.mockResolvedValue(mockSession as any);

      const result = await mobileAuthService.createDeviceSession(deviceId, userId, capabilities);

      expect(result).toMatchObject({
        success: true,
        sessionToken: mockSessionToken,
        refreshToken: mockRefreshToken,
        expiresAt: expect.any(Date),
        capabilities
      });

      expect(mockSessionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId,
          userId,
          sessionToken: mockSessionToken,
          capabilities
        })
      );
    });

    it('should invalidate existing sessions for same device before creating new one', async () => {
      // RED: This test will fail
      const deviceId = 'device-123';
      const userId = 'user-456';
      const capabilities = ['stream_control'];

      const existingSessions = [
        {
          id: 'session-1',
          deviceId,
          userId,
          isActive: true,
          expire: jest.fn()
        },
        {
          id: 'session-2', 
          deviceId,
          userId,
          isActive: true,
          expire: jest.fn()
        }
      ];

      mockSessionRepository.find.mockResolvedValue(existingSessions as any);
      mockTokenGenerator.generateSessionToken.mockReturnValue('new-session-token');
      mockTokenGenerator.generateRefreshToken.mockReturnValue('new-refresh-token');

      const mockNewSession = {
        id: 'new-session',
        sessionToken: 'new-session-token'
      };

      mockSessionRepository.create.mockReturnValue(mockNewSession as any);
      mockSessionRepository.save.mockResolvedValue(mockNewSession as any);

      const result = await mobileAuthService.createDeviceSession(deviceId, userId, capabilities);

      expect(result.success).toBe(true);
      
      // Should expire existing sessions
      expect(existingSessions[0].expire).toHaveBeenCalledWith('New session created');
      expect(existingSessions[1].expire).toHaveBeenCalledWith('New session created');
      
      // Should save expired sessions and new session
      expect(mockSessionRepository.save).toHaveBeenCalledTimes(3);
    });

    it('should handle database errors gracefully during session creation', async () => {
      // RED: This test will fail
      const deviceId = 'device-123';
      const userId = 'user-456';
      const capabilities = ['stream_control'];

      mockSessionRepository.find.mockResolvedValue([]);
      mockSessionRepository.save.mockRejectedValue(new Error('Database connection failed'));

      const result = await mobileAuthService.createDeviceSession(deviceId, userId, capabilities);

      expect(result).toMatchObject({
        success: false,
        error: 'Failed to create session'
      });
    });
  });

  describe('Session Token Refresh (Interface Segregation Principle)', () => {
    it('should refresh valid session token and extend expiry', async () => {
      // RED: This test will fail
      const refreshToken = 'refresh-token-abc';
      const oldSessionToken = 'old-session-token';
      const newSessionToken = 'new-session-token';

      const mockSession = {
        id: 'session-123',
        deviceId: 'device-456',
        userId: 'user-789',
        sessionToken: oldSessionToken,
        refreshToken,
        capabilities: ['stream_control', 'pip_control'],
        isActive: true,
        isExpired: jest.fn().mockReturnValue(false),
        refreshSession: jest.fn()
      };

      mockSessionRepository.findOne.mockResolvedValue(mockSession as any);
      mockTokenGenerator.generateSessionToken.mockReturnValue(newSessionToken);
      mockSessionRepository.save.mockResolvedValue({
        ...mockSession,
        sessionToken: newSessionToken
      } as any);

      const result = await mobileAuthService.refreshSessionToken(refreshToken);

      expect(result).toMatchObject({
        success: true,
        newSessionToken,
        expiresAt: expect.any(Date),
        capabilities: ['stream_control', 'pip_control']
      });

      expect(mockSession.refreshSession).toHaveBeenCalledWith(newSessionToken);
      expect(mockSessionRepository.save).toHaveBeenCalledWith(mockSession);
    });

    it('should reject refresh of expired or invalid tokens', async () => {
      // RED: This test will fail
      const invalidRefreshToken = 'invalid-refresh-token';

      mockSessionRepository.findOne.mockResolvedValue(null);

      const result = await mobileAuthService.refreshSessionToken(invalidRefreshToken);

      expect(result).toMatchObject({
        success: false,
        error: 'Invalid refresh token'
      });
    });

    it('should reject refresh of expired sessions', async () => {
      // RED: This test will fail
      const refreshToken = 'refresh-token-expired';
      
      const mockExpiredSession = {
        id: 'expired-session',
        refreshToken,
        isActive: false,
        isExpired: jest.fn().mockReturnValue(true)
      };

      mockSessionRepository.findOne.mockResolvedValue(mockExpiredSession as any);

      const result = await mobileAuthService.refreshSessionToken(refreshToken);

      expect(result).toMatchObject({
        success: false,
        error: 'Session has expired'
      });
    });
  });

  describe('Session Validation and Management (Dependency Inversion Principle)', () => {
    it('should validate active session and update last activity', async () => {
      // RED: This test will fail
      const sessionToken = 'valid-session-token';
      
      const mockSession = {
        id: 'session-123',
        deviceId: 'device-456',
        userId: 'user-789',
        sessionToken,
        capabilities: ['stream_control'],
        isActive: true,
        lastActivity: new Date(Date.now() - 30000), // 30 seconds ago
        shouldExpire: jest.fn().mockReturnValue(false),
        updateActivity: jest.fn()
      };

      mockSessionRepository.findOne.mockResolvedValue(mockSession as any);
      mockSessionRepository.save.mockResolvedValue(mockSession as any);

      const result = await mobileAuthService.validateSession(sessionToken);

      expect(result).toMatchObject({
        valid: true,
        session: {
          id: 'session-123',
          deviceId: 'device-456',
          userId: 'user-789',
          capabilities: ['stream_control'],
          isActive: true
        }
      });

      expect(mockSession.updateActivity).toHaveBeenCalled();
      expect(mockSessionRepository.save).toHaveBeenCalledWith(mockSession);
    });

    it('should expire stale sessions automatically', async () => {
      // RED: This test will fail
      const sessionToken = 'stale-session-token';
      
      const mockStaleSession = {
        id: 'stale-session',
        sessionToken,
        lastActivity: new Date(Date.now() - 1800000), // 30 minutes ago
        shouldExpire: jest.fn().mockReturnValue(true),
        expire: jest.fn()
      };

      mockSessionRepository.findOne.mockResolvedValue(mockStaleSession as any);
      mockSessionRepository.save.mockResolvedValue(mockStaleSession as any);

      const result = await mobileAuthService.validateSession(sessionToken);

      expect(result).toMatchObject({
        valid: false,
        error: 'Session has expired'
      });

      expect(mockStaleSession.expire).toHaveBeenCalledWith('Session stale - auto-expired');
      expect(mockSessionRepository.save).toHaveBeenCalledWith(mockStaleSession);
    });

    it('should revoke session and cleanup associated data', async () => {
      // RED: This test will fail
      const sessionToken = 'session-to-revoke';
      
      const mockSession = {
        id: 'session-123',
        deviceId: 'device-456',
        sessionToken,
        isActive: true,
        expire: jest.fn()
      };

      mockSessionRepository.findOne.mockResolvedValue(mockSession as any);
      mockSessionRepository.save.mockResolvedValue(mockSession as any);

      const result = await mobileAuthService.revokeSession(sessionToken, 'User logout');

      expect(result).toBe(true);
      expect(mockSession.expire).toHaveBeenCalledWith('User logout');
      expect(mockSessionRepository.save).toHaveBeenCalledWith(mockSession);
    });
  });

  describe('Security and Audit Features', () => {
    it('should track and log suspicious pairing attempts', async () => {
      // RED: This test will fail
      const suspiciousUserId = 'suspicious-user';
      const deviceInfo = {
        name: 'Suspicious Device',
        model: 'Unknown',
        os: 'iOS' as const,
        osVersion: '17.0',
        appVersion: '1.0.0',
        capabilities: ['stream_control']
      };

      // Mock multiple recent attempts
      const recentAttempts = Array.from({ length: 10 }, (_, i) => ({
        id: `attempt-${i}`,
        userId: suspiciousUserId,
        createdAt: new Date(Date.now() - i * 10000) // Every 10 seconds
      }));

      mockPairingTokenRepository.find.mockResolvedValue(recentAttempts as any);

      await expect(
        mobileAuthService.generatePairingToken(suspiciousUserId, deviceInfo)
      ).rejects.toThrow('Rate limit exceeded');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Suspicious pairing activity'),
        expect.objectContaining({
          userId: suspiciousUserId,
          attemptCount: recentAttempts.length
        })
      );
    });

    it('should generate audit trail for authentication events', async () => {
      // RED: This test will fail
      const userId = 'user-123';
      const deviceId = 'device-456';
      
      jest.spyOn(mobileAuthService as any, 'createAuditLog');

      await mobileAuthService.createDeviceSession(deviceId, userId, ['stream_control']);

      expect((mobileAuthService as any).createAuditLog).toHaveBeenCalledWith({
        event: 'session_created',
        userId,
        deviceId,
        timestamp: expect.any(Date),
        metadata: expect.any(Object)
      });
    });

    it('should validate device fingerprinting for additional security', async () => {
      // RED: This test will fail
      const deviceInfo = {
        name: 'iPhone 15 Pro',
        model: 'iPhone15,3',
        os: 'iOS' as const,
        osVersion: '17.2',
        appVersion: '1.0.0',
        capabilities: ['stream_control'],
        fingerprint: 'device-fingerprint-hash'
      };

      const existingDevice = {
        deviceId: 'device-123',
        fingerprint: 'different-fingerprint-hash',
        isSuspicious: jest.fn().mockReturnValue(true)
      };

      mockDeviceRepository.findOne.mockResolvedValue(existingDevice as any);

      const result = await mobileAuthService.validateDeviceFingerprint('device-123', deviceInfo);

      expect(result).toMatchObject({
        valid: false,
        reason: 'Device fingerprint mismatch',
        suspicious: true
      });

      expect(existingDevice.isSuspicious).toHaveBeenCalled();
    });

    it('should implement token rotation for enhanced security', async () => {
      // RED: This test will fail
      const oldRefreshToken = 'old-refresh-token';
      const newRefreshToken = 'new-refresh-token';
      const newSessionToken = 'new-session-token';

      const mockSession = {
        id: 'session-123',
        refreshToken: oldRefreshToken,
        rotateTokens: jest.fn().mockReturnValue({
          sessionToken: newSessionToken,
          refreshToken: newRefreshToken
        })
      };

      mockSessionRepository.findOne.mockResolvedValue(mockSession as any);
      mockTokenGenerator.generateSessionToken.mockReturnValue(newSessionToken);
      mockTokenGenerator.generateRefreshToken.mockReturnValue(newRefreshToken);
      mockSessionRepository.save.mockResolvedValue(mockSession as any);

      const result = await mobileAuthService.rotateSessionTokens(oldRefreshToken);

      expect(result).toMatchObject({
        success: true,
        newSessionToken,
        newRefreshToken,
        expiresAt: expect.any(Date)
      });

      expect(mockSession.rotateTokens).toHaveBeenCalledWith(newSessionToken, newRefreshToken);
    });
  });

  describe('Cleanup and Maintenance Operations', () => {
    it('should cleanup expired tokens and sessions periodically', async () => {
      // RED: This test will fail
      const expiredTokens = [
        { id: 'token-1', isExpired: () => true, markAsExpired: jest.fn() },
        { id: 'token-2', isExpired: () => true, markAsExpired: jest.fn() }
      ];

      const expiredSessions = [
        { id: 'session-1', shouldExpire: () => true, expire: jest.fn() },
        { id: 'session-2', shouldExpire: () => true, expire: jest.fn() }
      ];

      mockPairingTokenRepository.find.mockResolvedValue(expiredTokens as any);
      mockSessionRepository.find.mockResolvedValue(expiredSessions as any);

      const result = await mobileAuthService.cleanupExpiredTokensAndSessions();

      expect(result).toMatchObject({
        expiredTokens: 2,
        expiredSessions: 2,
        timestamp: expect.any(Date)
      });

      expiredTokens.forEach(token => {
        expect(token.markAsExpired).toHaveBeenCalled();
      });

      expiredSessions.forEach(session => {
        expect(session.expire).toHaveBeenCalledWith('Cleanup - expired');
      });
    });

    it('should provide authentication statistics for monitoring', async () => {
      // RED: This test will fail
      const mockStats = {
        activeSessions: 15,
        activeTokens: 3,
        devicesCount: 25,
        totalAuthAttempts: 150,
        failedAuthAttempts: 8,
        suspiciousActivity: 2
      };

      mockSessionRepository.createQueryBuilder().getCount.mockResolvedValue(15);
      mockPairingTokenRepository.createQueryBuilder().getCount.mockResolvedValue(3);
      mockDeviceRepository.find.mockResolvedValue(Array(25));

      const result = await mobileAuthService.getAuthenticationStats();

      expect(result).toMatchObject({
        activeSessions: 15,
        activeTokens: 3,
        pairedDevices: 25,
        successRate: expect.any(Number),
        averageSessionDuration: expect.any(Number)
      });
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle concurrent pairing attempts gracefully', async () => {
      // RED: This test will fail
      const userId = 'user-123';
      const deviceInfo = {
        name: 'Test Device',
        model: 'TestModel',
        os: 'iOS' as const,
        osVersion: '17.0',
        appVersion: '1.0.0',
        capabilities: ['stream_control']
      };

      // Simulate concurrent database write conflict
      mockPairingTokenRepository.save
        .mockRejectedValueOnce(new Error('Unique constraint violation'))
        .mockResolvedValueOnce({ id: 'token-123' } as any);

      // Should retry and succeed
      const result = await mobileAuthService.generatePairingToken(userId, deviceInfo);

      expect(result.code).toBeDefined();
      expect(mockPairingTokenRepository.save).toHaveBeenCalledTimes(2);
    });

    it('should implement circuit breaker for database operations', async () => {
      // RED: This test will fail
      const sessionToken = 'session-token';

      // Simulate repeated database failures
      mockSessionRepository.findOne
        .mockRejectedValueOnce(new Error('Database timeout'))
        .mockRejectedValueOnce(new Error('Database timeout'))
        .mockRejectedValueOnce(new Error('Database timeout'));

      const result = await mobileAuthService.validateSession(sessionToken);

      expect(result).toMatchObject({
        valid: false,
        error: 'Service temporarily unavailable'
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Circuit breaker'),
        expect.any(Object)
      );
    });

    it('should handle malformed token data gracefully', async () => {
      // RED: This test will fail
      const malformedSessionToken = 'malformed.token.data';

      mockTokenGenerator.validateTokenFormat.mockReturnValue(false);

      const result = await mobileAuthService.validateSession(malformedSessionToken);

      expect(result).toMatchObject({
        valid: false,
        error: 'Invalid token format'
      });

      expect(mockSessionRepository.findOne).not.toHaveBeenCalled();
    });
  });
});
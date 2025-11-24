import { AuthSession } from '@/models/AuthSession';
import { User } from '@/models/User';

describe('AuthSession Model', () => {
  let authSession: AuthSession;
  let mockUser: User;

  beforeEach(() => {
    mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      username: 'testuser'
    } as User;

    authSession = new AuthSession();
    authSession.id = 'session-123';
    authSession.userId = 'user-123';
    authSession.user = mockUser;
    authSession.accessToken = 'access-token-123';
    authSession.refreshToken = 'refresh-token-123';
    authSession.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    authSession.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    authSession.ipAddress = '192.168.1.100';
    authSession.isActive = true;
    authSession.lastUsedAt = new Date();
    authSession.createdAt = new Date();
    authSession.updatedAt = new Date();
    authSession.metadata = null;
  });

  describe('Session State', () => {
    it('should identify expired session', () => {
      authSession.expiresAt = new Date(Date.now() - 1000); // 1 second ago
      expect(authSession.isExpired()).toBe(true);
    });

    it('should identify non-expired session', () => {
      authSession.expiresAt = new Date(Date.now() + 1000); // 1 second from now
      expect(authSession.isExpired()).toBe(false);
    });

    it('should identify valid session', () => {
      authSession.isActive = true;
      authSession.expiresAt = new Date(Date.now() + 1000);
      expect(authSession.isValid()).toBe(true);
    });

    it('should identify invalid session when inactive', () => {
      authSession.isActive = false;
      expect(authSession.isValid()).toBe(false);
    });

    it('should identify invalid session when expired', () => {
      authSession.isActive = true;
      authSession.expiresAt = new Date(Date.now() - 1000);
      expect(authSession.isValid()).toBe(false);
    });
  });

  describe('Time Calculations', () => {
    it('should calculate session age', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      authSession.createdAt = oneHourAgo;
      
      const age = authSession.getAge();
      expect(age).toBeGreaterThan(3590000); // ~1 hour in ms
      expect(age).toBeLessThan(3610000);
    });

    it('should calculate time since last use', () => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      authSession.lastUsedAt = thirtyMinutesAgo;
      
      const timeSinceLastUse = authSession.getTimeSinceLastUse();
      expect(timeSinceLastUse).toBeGreaterThan(1790000); // ~30 minutes in ms
      expect(timeSinceLastUse).toBeLessThan(1810000);
    });

    it('should calculate time until expiration', () => {
      const inTwoHours = new Date(Date.now() + 2 * 60 * 60 * 1000);
      authSession.expiresAt = inTwoHours;
      
      const timeUntilExpiration = authSession.getTimeUntilExpiration();
      expect(timeUntilExpiration).toBeGreaterThan(7190000); // ~2 hours in ms
      expect(timeUntilExpiration).toBeLessThan(7210000);
    });
  });

  describe('Session Management', () => {
    it('should identify idle session', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      authSession.lastUsedAt = twoHoursAgo;
      
      expect(authSession.isIdle(30 * 60 * 1000)).toBe(true); // 30 minutes timeout
    });

    it('should identify active session', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      authSession.lastUsedAt = fiveMinutesAgo;
      
      expect(authSession.isIdle(30 * 60 * 1000)).toBe(false); // 30 minutes timeout
    });

    it('should revoke session', () => {
      authSession.revoke();
      expect(authSession.isActive).toBe(false);
    });

    it('should extend session expiration', () => {
      const originalExpiration = authSession.expiresAt.getTime();
      const extensionMs = 60 * 60 * 1000; // 1 hour
      
      authSession.extend(extensionMs);
      
      expect(authSession.expiresAt.getTime()).toBe(originalExpiration + extensionMs);
    });

    it('should update session activity', () => {
      const originalLastUsed = authSession.lastUsedAt;
      const newUserAgent = 'New User Agent';
      const newIpAddress = '10.0.0.1';
      
      authSession.updateActivity(newUserAgent, newIpAddress);
      
      expect(authSession.lastUsedAt).not.toBe(originalLastUsed);
      expect(authSession.userAgent).toBe(newUserAgent);
      expect(authSession.ipAddress).toBe(newIpAddress);
    });
  });

  describe('Device Detection', () => {
    it('should detect Chrome browser', () => {
      authSession.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
      
      const deviceInfo = authSession.getDeviceInfo();
      expect(deviceInfo.browser).toBe('Chrome');
      expect(deviceInfo.os).toBe('Windows');
      expect(deviceInfo.device).toBe('Desktop');
      expect(deviceInfo.isMobile).toBe(false);
    });

    it('should detect Firefox browser', () => {
      authSession.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0';
      
      const deviceInfo = authSession.getDeviceInfo();
      expect(deviceInfo.browser).toBe('Firefox');
      expect(deviceInfo.os).toBe('Windows');
    });

    it('should detect Safari browser', () => {
      authSession.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Version/14.1.1 Safari/537.36';
      
      const deviceInfo = authSession.getDeviceInfo();
      expect(deviceInfo.browser).toBe('Safari');
      expect(deviceInfo.os).toBe('macOS');
    });

    it('should detect Edge browser', () => {
      authSession.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59';
      
      const deviceInfo = authSession.getDeviceInfo();
      expect(deviceInfo.browser).toBe('Edge');
    });

    it('should detect mobile device', () => {
      authSession.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1';
      
      const deviceInfo = authSession.getDeviceInfo();
      expect(deviceInfo.os).toBe('iOS');
      expect(deviceInfo.device).toBe('Mobile');
      expect(deviceInfo.isMobile).toBe(true);
    });

    it('should detect Android device', () => {
      authSession.userAgent = 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36';
      
      const deviceInfo = authSession.getDeviceInfo();
      expect(deviceInfo.os).toBe('Android');
      expect(deviceInfo.device).toBe('Mobile');
      expect(deviceInfo.isMobile).toBe(true);
    });

    it('should handle unknown user agent', () => {
      authSession.userAgent = null;
      
      const deviceInfo = authSession.getDeviceInfo();
      expect(deviceInfo.browser).toBe('Unknown');
      expect(deviceInfo.os).toBe('Unknown');
      expect(deviceInfo.device).toBe('Unknown');
      expect(deviceInfo.isMobile).toBe(false);
    });
  });

  describe('Security Level Assessment', () => {
    it('should assign high security level to recent active session', () => {
      authSession.isActive = true;
      authSession.expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      authSession.lastUsedAt = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
      authSession.createdAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      
      const securityLevel = authSession.getSecurityLevel();
      expect(securityLevel).toBe('high');
    });

    it('should assign low security level to old inactive session', () => {
      authSession.isActive = false;
      authSession.lastUsedAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      authSession.createdAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      authSession.userAgent = null;
      
      const securityLevel = authSession.getSecurityLevel();
      expect(securityLevel).toBe('low');
    });

    it('should assign medium security level to moderately active session', () => {
      authSession.isActive = true;
      authSession.expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      authSession.lastUsedAt = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago
      authSession.createdAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      
      const securityLevel = authSession.getSecurityLevel();
      expect(securityLevel).toBe('medium');
    });
  });

  describe('Session Validation', () => {
    it('should validate secure session', () => {
      authSession.isActive = true;
      authSession.expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      authSession.createdAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      authSession.lastUsedAt = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      
      const validation = authSession.validateSecurity();
      expect(validation.valid).toBe(true);
      expect(validation.risks).toHaveLength(0);
    });

    it('should detect expired session risk', () => {
      authSession.expiresAt = new Date(Date.now() - 1000); // expired
      
      const validation = authSession.validateSecurity();
      expect(validation.valid).toBe(false);
      expect(validation.risks).toContain('Session has expired');
    });

    it('should detect revoked session risk', () => {
      authSession.isActive = false;
      
      const validation = authSession.validateSecurity();
      expect(validation.valid).toBe(false);
      expect(validation.risks).toContain('Session has been revoked');
    });

    it('should warn about old session', () => {
      authSession.createdAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      
      const validation = authSession.validateSecurity();
      expect(validation.warnings).toContain('Session is old (>7 days)');
    });

    it('should warn about idle session', () => {
      authSession.lastUsedAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      
      const validation = authSession.validateSecurity();
      expect(validation.warnings).toContain('Session has been idle for more than 24 hours');
    });
  });

  describe('Safe JSON Conversion', () => {
    it('should exclude sensitive tokens from JSON', () => {
      const safeJson = authSession.toSafeJSON();
      
      expect(safeJson).not.toHaveProperty('accessToken');
      expect(safeJson).not.toHaveProperty('refreshToken');
      expect(safeJson).toHaveProperty('deviceInfo');
      expect(safeJson).toHaveProperty('securityLevel');
      expect(safeJson).toHaveProperty('isExpired');
      expect(safeJson).toHaveProperty('isValid');
    });
  });

  describe('Fingerprinting', () => {
    it('should generate consistent fingerprint', () => {
      const fingerprint1 = authSession.generateFingerprint();
      const fingerprint2 = authSession.generateFingerprint();
      
      expect(fingerprint1).toBe(fingerprint2);
      expect(fingerprint1).toHaveLength(64); // SHA-256 hex string
    });

    it('should generate different fingerprint for different session', () => {
      const fingerprint1 = authSession.generateFingerprint();
      
      authSession.userId = 'different-user';
      const fingerprint2 = authSession.generateFingerprint();
      
      expect(fingerprint1).not.toBe(fingerprint2);
    });
  });

  describe('Static Methods', () => {
    it('should calculate expiration for regular session', () => {
      const expiration = AuthSession.calculateExpiration(false);
      const expectedTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      expect(Math.abs(expiration.getTime() - expectedTime.getTime())).toBeLessThan(1000);
    });

    it('should calculate expiration for remembered session', () => {
      const expiration = AuthSession.calculateExpiration(true);
      const expectedTime = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      
      expect(Math.abs(expiration.getTime() - expectedTime.getTime())).toBeLessThan(1000);
    });
  });

  describe('Activity Updates', () => {
    it('should update last used time before insert', () => {
      const beforeInsert = authSession.lastUsedAt;
      authSession.updateLastUsed();
      expect(authSession.lastUsedAt).not.toBe(beforeInsert);
    });

    it('should update last used time before update', () => {
      const beforeUpdate = authSession.lastUsedAt;
      authSession.updateLastUsed();
      expect(authSession.lastUsedAt).not.toBe(beforeUpdate);
    });
  });
});
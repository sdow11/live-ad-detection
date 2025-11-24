import { MobileRemoteService } from '@/services/MobileRemoteService';
import { IMobileRemoteService, DeviceInfo, RemoteCommand, PairingRequest, PairingStatus, StreamControlCommand } from '@/interfaces/IMobileRemoteService';
import { Repository } from 'typeorm';
import { MobileDevice } from '@/models/MobileDevice';
import { RemoteSession } from '@/models/RemoteSession';
import { User } from '@/models/User';

// TDD Phase 1: RED - Write failing tests for Mobile Remote Control System
// These tests define the behavior we want BEFORE implementing the code

describe('MobileRemoteService (TDD)', () => {
  let mobileRemoteService: MobileRemoteService;
  let mockDeviceRepository: jest.Mocked<Repository<MobileDevice>>;
  let mockSessionRepository: jest.Mocked<Repository<RemoteSession>>;
  let mockUserRepository: jest.Mocked<Repository<User>>;
  let mockStreamService: any;
  let mockWebSocketService: any;
  let mockAuthService: any;

  beforeEach(() => {
    mockDeviceRepository = {
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
        getMany: jest.fn().mockResolvedValue([])
      })
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

    mockStreamService = {
      startStream: jest.fn(),
      stopStream: jest.fn(),
      pauseStream: jest.fn(),
      resumeStream: jest.fn(),
      updateStreamQuality: jest.fn(),
      getStream: jest.fn(),
      getStreamsByUser: jest.fn()
    };

    mockWebSocketService = {
      emit: jest.fn(),
      emitToRoom: jest.fn(),
      emitToDevice: jest.fn(),
      createDeviceRoom: jest.fn(),
      leaveDeviceRoom: jest.fn()
    };

    mockAuthService = {
      generatePairingToken: jest.fn(),
      validatePairingToken: jest.fn(),
      createDeviceSession: jest.fn()
    };

    mobileRemoteService = new MobileRemoteService(
      mockDeviceRepository,
      mockSessionRepository,
      mockUserRepository,
      mockStreamService,
      mockWebSocketService,
      mockAuthService
    );
  });

  describe('Device Pairing and Registration', () => {
    it('should initiate device pairing process', async () => {
      // RED: This test will fail because we haven't implemented the method yet
      const userId = 'user-123';
      const deviceInfo: DeviceInfo = {
        name: 'iPhone 15 Pro',
        model: 'iPhone15,3',
        os: 'iOS',
        osVersion: '17.2',
        appVersion: '1.0.0',
        capabilities: ['stream_control', 'pip_control', 'notifications']
      };

      const mockPairingCode = 'ABC123';
      const mockPairingToken = 'pair-token-456';

      mockAuthService.generatePairingToken.mockResolvedValue({
        code: mockPairingCode,
        token: mockPairingToken,
        expiresAt: new Date(Date.now() + 300000) // 5 minutes
      });

      const result = await mobileRemoteService.initiatePairing(userId, deviceInfo);

      expect(result).toMatchObject({
        pairingCode: mockPairingCode,
        expiresAt: expect.any(Date),
        instructions: expect.stringContaining('Enter this code')
      });
      expect(mockAuthService.generatePairingToken).toHaveBeenCalledWith(userId, deviceInfo);
    });

    it('should complete device pairing with valid code', async () => {
      // RED: This test will fail
      const pairingCode = 'ABC123';
      const deviceId = 'device-789';
      
      const mockDevice = {
        id: 'mobile-device-456',
        userId: 'user-123',
        deviceId,
        name: 'iPhone 15 Pro',
        model: 'iPhone15,3',
        os: 'iOS',
        osVersion: '17.2',
        isPaired: true,
        lastSeen: new Date(),
        capabilities: ['stream_control', 'pip_control']
      };

      mockAuthService.validatePairingToken.mockResolvedValue({
        valid: true,
        userId: 'user-123',
        deviceInfo: {
          name: 'iPhone 15 Pro',
          model: 'iPhone15,3',
          os: 'iOS',
          osVersion: '17.2',
          appVersion: '1.0.0',
          capabilities: ['stream_control', 'pip_control', 'notifications']
        }
      });

      mockDeviceRepository.create.mockReturnValue(mockDevice as any);
      mockDeviceRepository.save.mockResolvedValue(mockDevice as any);

      const result = await mobileRemoteService.completePairing(pairingCode, deviceId);

      expect(result).toMatchObject({
        status: PairingStatus.SUCCESS,
        device: expect.objectContaining({
          id: 'mobile-device-456',
          name: 'iPhone 15 Pro',
          isPaired: true
        }),
        sessionToken: expect.any(String)
      });
      
      expect(mockDeviceRepository.save).toHaveBeenCalled();
    });

    it('should reject pairing with invalid or expired code', async () => {
      // RED: This test will fail
      const invalidCode = 'INVALID';
      const deviceId = 'device-789';

      mockAuthService.validatePairingToken.mockResolvedValue({
        valid: false,
        error: 'Code has expired or is invalid'
      });

      const result = await mobileRemoteService.completePairing(invalidCode, deviceId);

      expect(result).toMatchObject({
        status: PairingStatus.FAILED,
        error: 'Code has expired or is invalid'
      });
      expect(mockDeviceRepository.save).not.toHaveBeenCalled();
    });

    it('should list paired devices for a user', async () => {
      // RED: This test will fail
      const userId = 'user-123';
      const mockDevices = [
        {
          id: 'device-1',
          userId,
          name: 'iPhone 15 Pro',
          model: 'iPhone15,3',
          os: 'iOS',
          isPaired: true,
          lastSeen: new Date(),
          capabilities: ['stream_control', 'pip_control']
        },
        {
          id: 'device-2',
          userId,
          name: 'Samsung Galaxy S24',
          model: 'SM-S921B',
          os: 'Android',
          isPaired: true,
          lastSeen: new Date(),
          capabilities: ['stream_control', 'notifications']
        }
      ];

      mockDeviceRepository.find.mockResolvedValue(mockDevices as any);

      const result = await mobileRemoteService.getUserDevices(userId);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'device-1',
        name: 'iPhone 15 Pro',
        isPaired: true
      });
      expect(mockDeviceRepository.find).toHaveBeenCalledWith({
        where: { userId, isPaired: true },
        order: { lastSeen: 'DESC' }
      });
    });
  });

  describe('Remote Stream Control', () => {
    it('should execute stream start command from mobile device', async () => {
      // RED: This test will fail
      const deviceId = 'device-123';
      const userId = 'user-456';
      const streamId = 'stream-789';
      
      const command: StreamControlCommand = {
        type: 'stream_start',
        streamId,
        parameters: {}
      };

      const mockDevice = {
        id: deviceId,
        userId,
        isPaired: true,
        hasCapability: jest.fn().mockReturnValue(true)
      };

      const mockSession = {
        id: 'session-456',
        deviceId,
        userId,
        isActive: true
      };

      mockDeviceRepository.findOne.mockResolvedValue(mockDevice as any);
      mockSessionRepository.findOne.mockResolvedValue(mockSession as any);
      mockStreamService.startStream.mockResolvedValue(undefined);

      const result = await mobileRemoteService.executeStreamCommand(deviceId, command);

      expect(result).toMatchObject({
        success: true,
        commandId: expect.any(String),
        result: {
          action: 'stream_started',
          streamId
        }
      });
      
      expect(mockStreamService.startStream).toHaveBeenCalledWith(streamId, userId);
      expect(mockWebSocketService.emitToDevice).toHaveBeenCalledWith(
        deviceId,
        'commandExecuted',
        expect.objectContaining({
          success: true,
          action: 'stream_started'
        })
      );
    });

    it('should execute stream stop command from mobile device', async () => {
      // RED: This test will fail
      const deviceId = 'device-123';
      const streamId = 'stream-789';
      
      const command: StreamControlCommand = {
        type: 'stream_stop',
        streamId,
        parameters: {}
      };

      const mockDevice = {
        id: deviceId,
        userId: 'user-456',
        isPaired: true,
        hasCapability: jest.fn().mockReturnValue(true)
      };

      mockDeviceRepository.findOne.mockResolvedValue(mockDevice as any);
      mockSessionRepository.findOne.mockResolvedValue({
        isActive: true,
        userId: 'user-456'
      } as any);
      mockStreamService.stopStream.mockResolvedValue(undefined);

      const result = await mobileRemoteService.executeStreamCommand(deviceId, command);

      expect(result.success).toBe(true);
      expect(result.result.action).toBe('stream_stopped');
      expect(mockStreamService.stopStream).toHaveBeenCalledWith(streamId, 'user-456');
    });

    it('should execute quality change command from mobile device', async () => {
      // RED: This test will fail
      const deviceId = 'device-123';
      const streamId = 'stream-789';
      
      const command: StreamControlCommand = {
        type: 'quality_change',
        streamId,
        parameters: {
          quality: {
            resolution: '1280x720',
            bitrate: 1500,
            framerate: 30
          }
        }
      };

      const mockDevice = {
        id: deviceId,
        userId: 'user-456',
        isPaired: true,
        hasCapability: jest.fn().mockReturnValue(true)
      };

      mockDeviceRepository.findOne.mockResolvedValue(mockDevice as any);
      mockSessionRepository.findOne.mockResolvedValue({
        isActive: true,
        userId: 'user-456'
      } as any);
      mockStreamService.updateStreamQuality.mockResolvedValue(undefined);

      const result = await mobileRemoteService.executeStreamCommand(deviceId, command);

      expect(result.success).toBe(true);
      expect(mockStreamService.updateStreamQuality).toHaveBeenCalledWith(
        streamId,
        'user-456',
        command.parameters.quality
      );
    });

    it('should reject commands from unauthorized devices', async () => {
      // RED: This test will fail
      const unauthorizedDeviceId = 'device-999';
      const command: StreamControlCommand = {
        type: 'stream_start',
        streamId: 'stream-123',
        parameters: {}
      };

      mockDeviceRepository.findOne.mockResolvedValue(null);

      await expect(
        mobileRemoteService.executeStreamCommand(unauthorizedDeviceId, command)
      ).rejects.toThrow('Device not found or not paired');
    });

    it('should reject commands from devices without required capabilities', async () => {
      // RED: This test will fail
      const deviceId = 'device-123';
      const command: StreamControlCommand = {
        type: 'stream_start',
        streamId: 'stream-789',
        parameters: {}
      };

      const mockDevice = {
        id: deviceId,
        userId: 'user-456',
        isPaired: true,
        hasCapability: jest.fn().mockReturnValue(false) // No stream_control capability
      };

      mockDeviceRepository.findOne.mockResolvedValue(mockDevice as any);

      await expect(
        mobileRemoteService.executeStreamCommand(deviceId, command)
      ).rejects.toThrow('Device does not have required capability: stream_control');
    });
  });

  describe('Picture-in-Picture Control', () => {
    it('should enable PiP mode from mobile device', async () => {
      // RED: This test will fail
      const deviceId = 'device-123';
      const streamId = 'stream-789';
      
      const command: RemoteCommand = {
        type: 'pip_enable',
        parameters: {
          streamId,
          position: { x: 10, y: 10 },
          size: { width: 320, height: 180 }
        }
      };

      const mockDevice = {
        id: deviceId,
        userId: 'user-456',
        isPaired: true,
        hasCapability: jest.fn().mockReturnValue(true)
      };

      mockDeviceRepository.findOne.mockResolvedValue(mockDevice as any);
      mockSessionRepository.findOne.mockResolvedValue({
        isActive: true,
        userId: 'user-456'
      } as any);

      const result = await mobileRemoteService.executeCommand(deviceId, command);

      expect(result).toMatchObject({
        success: true,
        result: {
          action: 'pip_enabled',
          streamId,
          pipConfig: expect.objectContaining({
            position: { x: 10, y: 10 },
            size: { width: 320, height: 180 }
          })
        }
      });

      expect(mockWebSocketService.emitToRoom).toHaveBeenCalledWith(
        `user:user-456`,
        'pipCommand',
        expect.objectContaining({
          action: 'enable',
          streamId
        })
      );
    });

    it('should disable PiP mode from mobile device', async () => {
      // RED: This test will fail
      const deviceId = 'device-123';
      
      const command: RemoteCommand = {
        type: 'pip_disable',
        parameters: {}
      };

      const mockDevice = {
        id: deviceId,
        userId: 'user-456',
        isPaired: true,
        hasCapability: jest.fn().mockReturnValue(true)
      };

      mockDeviceRepository.findOne.mockResolvedValue(mockDevice as any);
      mockSessionRepository.findOne.mockResolvedValue({
        isActive: true,
        userId: 'user-456'
      } as any);

      const result = await mobileRemoteService.executeCommand(deviceId, command);

      expect(result.success).toBe(true);
      expect(result.result.action).toBe('pip_disabled');
      expect(mockWebSocketService.emitToRoom).toHaveBeenCalledWith(
        `user:user-456`,
        'pipCommand',
        { action: 'disable' }
      );
    });
  });

  describe('Real-time Notifications and Status', () => {
    it('should send stream status updates to paired devices', async () => {
      // RED: This test will fail
      const userId = 'user-123';
      const streamId = 'stream-456';
      const statusUpdate = {
        streamId,
        status: 'live',
        viewers: 45,
        health: 'good',
        timestamp: new Date()
      };

      const mockDevices = [
        {
          id: 'device-1',
          userId,
          isPaired: true,
          hasCapability: jest.fn().mockReturnValue(true)
        },
        {
          id: 'device-2',
          userId,
          isPaired: true,
          hasCapability: jest.fn().mockReturnValue(true)
        }
      ];

      mockDeviceRepository.find.mockResolvedValue(mockDevices as any);

      await mobileRemoteService.broadcastStreamStatus(userId, statusUpdate);

      expect(mockWebSocketService.emitToDevice).toHaveBeenCalledWith(
        'device-1',
        'streamStatusUpdate',
        statusUpdate
      );
      expect(mockWebSocketService.emitToDevice).toHaveBeenCalledWith(
        'device-2',
        'streamStatusUpdate',
        statusUpdate
      );
    });

    it('should send ad detection notifications to mobile devices', async () => {
      // RED: This test will fail
      const userId = 'user-123';
      const adDetection = {
        streamId: 'stream-456',
        type: 'commercial',
        confidence: 0.95,
        timestamp: new Date(),
        action: 'pip_enabled'
      };

      const mockDevices = [
        {
          id: 'device-1',
          userId,
          isPaired: true,
          hasCapability: jest.fn().mockReturnValue(true)
        }
      ];

      mockDeviceRepository.find.mockResolvedValue(mockDevices as any);

      await mobileRemoteService.sendAdDetectionNotification(userId, adDetection);

      expect(mockWebSocketService.emitToDevice).toHaveBeenCalledWith(
        'device-1',
        'adDetected',
        expect.objectContaining({
          type: 'commercial',
          confidence: 0.95,
          action: 'pip_enabled'
        })
      );
    });

    it('should get real-time device status and capabilities', async () => {
      // RED: This test will fail
      const deviceId = 'device-123';
      
      const mockDevice = {
        id: deviceId,
        name: 'iPhone 15 Pro',
        model: 'iPhone15,3',
        os: 'iOS',
        osVersion: '17.2',
        isPaired: true,
        lastSeen: new Date(),
        capabilities: ['stream_control', 'pip_control', 'notifications'],
        batteryLevel: 85,
        isOnline: true
      };

      mockDeviceRepository.findOne.mockResolvedValue(mockDevice as any);

      const result = await mobileRemoteService.getDeviceStatus(deviceId);

      expect(result).toMatchObject({
        id: deviceId,
        name: 'iPhone 15 Pro',
        isOnline: true,
        batteryLevel: 85,
        capabilities: ['stream_control', 'pip_control', 'notifications'],
        lastSeen: expect.any(Date)
      });
    });
  });

  describe('Session Management', () => {
    it('should create and manage device sessions', async () => {
      // RED: This test will fail
      const deviceId = 'device-123';
      const userId = 'user-456';

      const mockSession = {
        id: 'session-789',
        deviceId,
        userId,
        isActive: true,
        startedAt: new Date(),
        lastActivity: new Date(),
        sessionToken: 'session-token-abc'
      };

      mockSessionRepository.create.mockReturnValue(mockSession as any);
      mockSessionRepository.save.mockResolvedValue(mockSession as any);
      mockAuthService.createDeviceSession.mockResolvedValue('session-token-abc');

      const result = await mobileRemoteService.createSession(deviceId, userId);

      expect(result).toMatchObject({
        sessionId: 'session-789',
        token: 'session-token-abc',
        expiresAt: expect.any(Date)
      });
      
      expect(mockSessionRepository.save).toHaveBeenCalled();
      expect(mockAuthService.createDeviceSession).toHaveBeenCalledWith(deviceId, userId);
    });

    it('should validate and refresh device sessions', async () => {
      // RED: This test will fail
      const sessionToken = 'session-token-abc';
      
      const mockSession = {
        id: 'session-789',
        deviceId: 'device-123',
        userId: 'user-456',
        isActive: true,
        lastActivity: new Date(Date.now() - 30000), // 30 seconds ago
        sessionToken
      };

      mockSessionRepository.findOne.mockResolvedValue(mockSession as any);

      const result = await mobileRemoteService.validateSession(sessionToken);

      expect(result).toMatchObject({
        valid: true,
        session: expect.objectContaining({
          deviceId: 'device-123',
          userId: 'user-456',
          isActive: true
        })
      });
      
      // Should update last activity
      expect(mockSessionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          lastActivity: expect.any(Date)
        })
      );
    });

    it('should expire old sessions automatically', async () => {
      // RED: This test will fail
      const expiredSessionToken = 'expired-session-token';
      
      const expiredSession = {
        id: 'session-expired',
        isActive: true,
        lastActivity: new Date(Date.now() - 3600000), // 1 hour ago
        sessionToken: expiredSessionToken
      };

      mockSessionRepository.findOne.mockResolvedValue(expiredSession as any);

      const result = await mobileRemoteService.validateSession(expiredSessionToken);

      expect(result).toMatchObject({
        valid: false,
        error: 'Session has expired'
      });
      
      // Should deactivate expired session
      expect(mockSessionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false
        })
      );
    });
  });

  describe('Device Management', () => {
    it('should unpair a device and revoke access', async () => {
      // RED: This test will fail
      const deviceId = 'device-123';
      const userId = 'user-456';

      const mockDevice = {
        id: deviceId,
        userId,
        isPaired: true,
        unpair: jest.fn()
      };

      const mockSessions = [
        { id: 'session-1', deviceId, isActive: true },
        { id: 'session-2', deviceId, isActive: true }
      ];

      mockDeviceRepository.findOne.mockResolvedValue(mockDevice as any);
      mockSessionRepository.find.mockResolvedValue(mockSessions as any);

      await mobileRemoteService.unpairDevice(deviceId, userId);

      expect(mockDevice.unpair).toHaveBeenCalled();
      expect(mockDeviceRepository.save).toHaveBeenCalledWith(mockDevice);
      
      // Should deactivate all sessions
      expect(mockSessionRepository.save).toHaveBeenCalledTimes(2);
      expect(mockWebSocketService.emitToDevice).toHaveBeenCalledWith(
        deviceId,
        'deviceUnpaired',
        { reason: 'Device was unpaired by user' }
      );
    });

    it('should update device information and capabilities', async () => {
      // RED: This test will fail
      const deviceId = 'device-123';
      const updates = {
        name: 'Updated iPhone Name',
        osVersion: '17.3',
        appVersion: '1.1.0',
        capabilities: ['stream_control', 'pip_control', 'notifications', 'voice_control']
      };

      const mockDevice = {
        id: deviceId,
        name: 'iPhone 15 Pro',
        osVersion: '17.2',
        appVersion: '1.0.0',
        capabilities: ['stream_control', 'pip_control'],
        updateInfo: jest.fn()
      };

      mockDeviceRepository.findOne.mockResolvedValue(mockDevice as any);
      mockDeviceRepository.save.mockResolvedValue({ ...mockDevice, ...updates } as any);

      const result = await mobileRemoteService.updateDevice(deviceId, updates);

      expect(mockDevice.updateInfo).toHaveBeenCalledWith(updates);
      expect(result).toMatchObject({
        id: deviceId,
        name: 'Updated iPhone Name',
        osVersion: '17.3',
        appVersion: '1.1.0',
        capabilities: expect.arrayContaining(['voice_control'])
      });
    });
  });

  describe('Error Handling and Security', () => {
    it('should handle database errors gracefully', async () => {
      // RED: This test will fail
      const userId = 'user-123';
      const deviceInfo = {
        name: 'Test Device',
        model: 'Test Model',
        os: 'TestOS',
        osVersion: '1.0',
        appVersion: '1.0.0',
        capabilities: ['stream_control']
      };

      mockAuthService.generatePairingToken.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(
        mobileRemoteService.initiatePairing(userId, deviceInfo)
      ).rejects.toThrow('Failed to initiate pairing');
    });

    it('should rate limit pairing attempts', async () => {
      // RED: This test will fail
      const userId = 'user-123';
      const deviceInfo = {
        name: 'Test Device',
        model: 'Test Model',
        os: 'TestOS',
        osVersion: '1.0',
        appVersion: '1.0.0',
        capabilities: ['stream_control']
      };

      // Simulate multiple rapid pairing attempts
      jest.spyOn(mobileRemoteService as any, 'checkRateLimit')
        .mockResolvedValue(false);

      await expect(
        mobileRemoteService.initiatePairing(userId, deviceInfo)
      ).rejects.toThrow('Too many pairing attempts. Please try again later.');
    });

    it('should validate command permissions and user ownership', async () => {
      // RED: This test will fail
      const deviceId = 'device-123';
      const streamId = 'stream-owned-by-other-user';
      
      const command: StreamControlCommand = {
        type: 'stream_stop',
        streamId,
        parameters: {}
      };

      const mockDevice = {
        id: deviceId,
        userId: 'user-456',
        isPaired: true,
        hasCapability: jest.fn().mockReturnValue(true)
      };

      mockDeviceRepository.findOne.mockResolvedValue(mockDevice as any);
      mockSessionRepository.findOne.mockResolvedValue({
        isActive: true,
        userId: 'user-456'
      } as any);
      
      mockStreamService.stopStream.mockRejectedValue(
        new Error('Unauthorized: You do not own this stream')
      );

      await expect(
        mobileRemoteService.executeStreamCommand(deviceId, command)
      ).rejects.toThrow('Unauthorized: You do not own this stream');
    });
  });
});
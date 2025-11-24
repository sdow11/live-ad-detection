import { MobileWebSocketHandler } from '@/websocket/MobileWebSocketHandler';
import { MobileRemoteService } from '@/services/MobileRemoteService';
import { WebSocketAuthService } from '@/services/WebSocketAuthService';
import { Logger } from '@/utils/Logger';
import { Server as SocketIOServer } from 'socket.io';
import { Socket } from 'socket.io';

// TDD Phase 1: RED - Write failing tests for Mobile WebSocket Handler
// These tests define the expected behavior for real-time mobile communication

describe('MobileWebSocketHandler (TDD)', () => {
  let handler: MobileWebSocketHandler;
  let mockMobileRemoteService: jest.Mocked<MobileRemoteService>;
  let mockWebSocketAuthService: jest.Mocked<WebSocketAuthService>;
  let mockLogger: jest.Mocked<Logger>;
  let mockIo: jest.Mocked<SocketIOServer>;
  let mockSocket: jest.Mocked<Socket>;

  beforeEach(() => {
    mockMobileRemoteService = {
      executeCommand: jest.fn(),
      executeStreamCommand: jest.fn(),
      validateSession: jest.fn(),
      getDeviceStatus: jest.fn(),
      updateDevice: jest.fn(),
      broadcastStreamStatus: jest.fn(),
      sendAdDetectionNotification: jest.fn(),
      sendPipStatusUpdate: jest.fn()
    } as any;

    mockWebSocketAuthService = {
      validateMobileSession: jest.fn(),
      authenticateSocket: jest.fn(),
      refreshSession: jest.fn(),
      revokeSession: jest.fn()
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn()
    } as any;

    mockIo = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      sockets: {
        sockets: new Map()
      }
    } as any;

    mockSocket = {
      id: 'socket-123',
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      disconnect: jest.fn(),
      on: jest.fn(),
      handshake: {
        auth: {},
        headers: {},
        address: '127.0.0.1'
      },
      data: {}
    } as any;

    handler = new MobileWebSocketHandler(
      mockMobileRemoteService,
      mockWebSocketAuthService,
      mockLogger
    );
  });

  describe('Connection and Authentication', () => {
    it('should authenticate mobile device on connection', async () => {
      // RED: This test will fail because we haven't implemented the method yet
      const sessionToken = 'mobile-session-token-123';
      const deviceId = 'device-456';

      mockSocket.handshake.auth = { sessionToken, deviceId };

      const mockSession = {
        valid: true,
        session: {
          id: 'session-789',
          deviceId,
          userId: 'user-123',
          isActive: true,
          capabilities: ['stream_control', 'pip_control']
        }
      };

      mockWebSocketAuthService.validateMobileSession.mockResolvedValue(mockSession);

      await handler.handleConnection(mockSocket, mockIo);

      expect(mockWebSocketAuthService.validateMobileSession).toHaveBeenCalledWith(sessionToken);
      expect(mockSocket.join).toHaveBeenCalledWith(`device:${deviceId}`);
      expect(mockSocket.join).toHaveBeenCalledWith(`user:user-123`);
      expect(mockSocket.data.authenticated).toBe(true);
      expect(mockSocket.data.deviceId).toBe(deviceId);
      expect(mockSocket.data.userId).toBe('user-123');
    });

    it('should reject connection with invalid session token', async () => {
      // RED: This test will fail
      const invalidToken = 'invalid-token';
      mockSocket.handshake.auth = { sessionToken: invalidToken, deviceId: 'device-456' };

      mockWebSocketAuthService.validateMobileSession.mockResolvedValue({
        valid: false,
        error: 'Invalid session token'
      });

      await handler.handleConnection(mockSocket, mockIo);

      expect(mockSocket.emit).toHaveBeenCalledWith('authenticationFailed', {
        error: 'Invalid session token'
      });
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should handle missing authentication credentials', async () => {
      // RED: This test will fail
      mockSocket.handshake.auth = {}; // No credentials

      await handler.handleConnection(mockSocket, mockIo);

      expect(mockSocket.emit).toHaveBeenCalledWith('authenticationFailed', {
        error: 'Missing session token or device ID'
      });
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should refresh session token when requested', async () => {
      // RED: This test will fail
      const refreshToken = 'refresh-token-abc';
      const newSessionToken = 'new-session-token-def';

      mockSocket.data = {
        authenticated: true,
        deviceId: 'device-123',
        userId: 'user-456'
      };

      mockWebSocketAuthService.refreshSession.mockResolvedValue({
        success: true,
        newToken: newSessionToken,
        expiresAt: new Date(Date.now() + 3600000)
      });

      await handler.handleSessionRefresh(mockSocket, { refreshToken });

      expect(mockWebSocketAuthService.refreshSession).toHaveBeenCalledWith(refreshToken);
      expect(mockSocket.emit).toHaveBeenCalledWith('sessionRefreshed', {
        token: newSessionToken,
        expiresAt: expect.any(Date)
      });
    });
  });

  describe('Remote Command Execution', () => {
    beforeEach(() => {
      mockSocket.data = {
        authenticated: true,
        deviceId: 'device-123',
        userId: 'user-456',
        capabilities: ['stream_control', 'pip_control']
      };
    });

    it('should execute remote commands and return results', async () => {
      // RED: This test will fail
      const command = {
        type: 'pip_enable',
        parameters: {
          streamId: 'stream-789',
          position: { x: 10, y: 10 },
          size: { width: 320, height: 180 }
        }
      };

      const mockResult = {
        success: true,
        commandId: 'cmd-123',
        result: {
          action: 'pip_enabled',
          streamId: 'stream-789',
          pipConfig: command.parameters
        },
        timestamp: new Date()
      };

      mockMobileRemoteService.executeCommand.mockResolvedValue(mockResult);

      await handler.handleExecuteCommand(mockSocket, command);

      expect(mockMobileRemoteService.executeCommand).toHaveBeenCalledWith(
        'device-123',
        command
      );
      expect(mockSocket.emit).toHaveBeenCalledWith('commandResult', mockResult);
    });

    it('should execute stream control commands', async () => {
      // RED: This test will fail
      const streamCommand = {
        type: 'stream_start',
        streamId: 'stream-456',
        parameters: {}
      };

      const mockResult = {
        success: true,
        commandId: 'cmd-456',
        result: {
          action: 'stream_started',
          streamId: 'stream-456'
        },
        timestamp: new Date()
      };

      mockMobileRemoteService.executeStreamCommand.mockResolvedValue(mockResult);

      await handler.handleExecuteStreamCommand(mockSocket, streamCommand);

      expect(mockMobileRemoteService.executeStreamCommand).toHaveBeenCalledWith(
        'device-123',
        streamCommand
      );
      expect(mockSocket.emit).toHaveBeenCalledWith('streamCommandResult', mockResult);
    });

    it('should handle command execution errors gracefully', async () => {
      // RED: This test will fail
      const command = {
        type: 'stream_stop',
        streamId: 'nonexistent-stream',
        parameters: {}
      };

      mockMobileRemoteService.executeStreamCommand.mockRejectedValue(
        new Error('Stream not found')
      );

      await handler.handleExecuteStreamCommand(mockSocket, command);

      expect(mockSocket.emit).toHaveBeenCalledWith('streamCommandResult', {
        success: false,
        error: 'Stream not found',
        timestamp: expect.any(Date)
      });
    });

    it('should reject commands from unauthenticated sockets', async () => {
      // RED: This test will fail
      mockSocket.data = { authenticated: false };

      const command = { type: 'pip_enable', parameters: {} };

      await handler.handleExecuteCommand(mockSocket, command);

      expect(mockSocket.emit).toHaveBeenCalledWith('commandResult', {
        success: false,
        error: 'Device not authenticated',
        timestamp: expect.any(Date)
      });
      expect(mockMobileRemoteService.executeCommand).not.toHaveBeenCalled();
    });
  });

  describe('Status and Information Requests', () => {
    beforeEach(() => {
      mockSocket.data = {
        authenticated: true,
        deviceId: 'device-123',
        userId: 'user-456'
      };
    });

    it('should handle device status requests', async () => {
      // RED: This test will fail
      const mockStatus = {
        id: 'device-123',
        name: 'iPhone 15 Pro',
        isOnline: true,
        batteryLevel: 85,
        capabilities: ['stream_control', 'pip_control'],
        lastSeen: new Date()
      };

      mockMobileRemoteService.getDeviceStatus.mockResolvedValue(mockStatus);

      await handler.handleStatusRequest(mockSocket, { type: 'device' });

      expect(mockMobileRemoteService.getDeviceStatus).toHaveBeenCalledWith('device-123');
      expect(mockSocket.emit).toHaveBeenCalledWith('statusResponse', {
        type: 'device',
        data: mockStatus
      });
    });

    it('should handle stream list requests', async () => {
      // RED: This test will fail
      const mockStreams = [
        {
          id: 'stream-1',
          title: 'Live Gaming Stream',
          status: 'live',
          viewers: 42,
          isPublic: true
        },
        {
          id: 'stream-2',
          title: 'Music Session',
          status: 'idle',
          viewers: 0,
          isPublic: false
        }
      ];

      // Mock the stream service call through MobileRemoteService
      jest.spyOn(handler as any, 'getStreamList').mockResolvedValue(mockStreams);

      await handler.handleStatusRequest(mockSocket, { type: 'streams' });

      expect(mockSocket.emit).toHaveBeenCalledWith('statusResponse', {
        type: 'streams',
        data: mockStreams
      });
    });

    it('should handle PiP status requests', async () => {
      // RED: This test will fail
      const mockPipStatus = {
        isEnabled: true,
        streamId: 'stream-123',
        position: { x: 10, y: 10 },
        size: { width: 320, height: 180 },
        timestamp: new Date()
      };

      jest.spyOn(handler as any, 'getPipStatus').mockResolvedValue(mockPipStatus);

      await handler.handleStatusRequest(mockSocket, { type: 'pip' });

      expect(mockSocket.emit).toHaveBeenCalledWith('statusResponse', {
        type: 'pip',
        data: mockPipStatus
      });
    });
  });

  describe('Heartbeat and Connection Management', () => {
    beforeEach(() => {
      mockSocket.data = {
        authenticated: true,
        deviceId: 'device-123',
        userId: 'user-456'
      };
    });

    it('should handle heartbeat messages and update device status', async () => {
      // RED: This test will fail
      const heartbeat = {
        timestamp: new Date(),
        batteryLevel: 75,
        networkType: 'wifi'
      };

      await handler.handleHeartbeat(mockSocket, heartbeat);

      expect(mockMobileRemoteService.updateDevice).toHaveBeenCalledWith(
        'device-123',
        {
          metadata: {
            lastHeartbeat: heartbeat.timestamp,
            batteryLevel: 75,
            networkType: 'wifi'
          }
        }
      );
      expect(mockSocket.emit).toHaveBeenCalledWith('heartbeatAck', {
        timestamp: expect.any(Date)
      });
    });

    it('should track connection metrics', async () => {
      // RED: This test will fail
      const connectionStart = new Date();
      mockSocket.data.connectedAt = connectionStart;

      await handler.handleDisconnection(mockSocket, 'client disconnect');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Mobile device disconnected: device-123')
      );
    });

    it('should cleanup device rooms on disconnection', async () => {
      // RED: This test will fail
      await handler.handleDisconnection(mockSocket, 'transport close');

      expect(mockSocket.leave).toHaveBeenCalledWith('device:device-123');
      expect(mockSocket.leave).toHaveBeenCalledWith('user:user-456');
    });
  });

  describe('Real-time Notifications', () => {
    it('should broadcast stream status updates to device rooms', async () => {
      // RED: This test will fail
      const streamUpdate = {
        streamId: 'stream-123',
        status: 'live',
        viewers: 50,
        timestamp: new Date()
      };

      await handler.broadcastStreamUpdate(mockIo, streamUpdate);

      expect(mockIo.to).toHaveBeenCalledWith(`stream:${streamUpdate.streamId}`);
      expect(mockIo.emit).toHaveBeenCalledWith('streamStatusUpdate', streamUpdate);
    });

    it('should send ad detection notifications to user devices', async () => {
      // RED: This test will fail
      const userId = 'user-123';
      const adNotification = {
        streamId: 'stream-456',
        type: 'commercial',
        confidence: 0.95,
        timestamp: new Date(),
        action: 'pip_enabled'
      };

      await handler.sendAdNotification(mockIo, userId, adNotification);

      expect(mockIo.to).toHaveBeenCalledWith(`user:${userId}`);
      expect(mockIo.emit).toHaveBeenCalledWith('adDetected', adNotification);
    });

    it('should send PiP status updates to user devices', async () => {
      // RED: This test will fail
      const userId = 'user-123';
      const pipUpdate = {
        isEnabled: true,
        streamId: 'stream-789',
        position: { x: 50, y: 50 },
        size: { width: 400, height: 225 },
        timestamp: new Date(),
        reason: 'ad_detected'
      };

      await handler.sendPipUpdate(mockIo, userId, pipUpdate);

      expect(mockIo.to).toHaveBeenCalledWith(`user:${userId}`);
      expect(mockIo.emit).toHaveBeenCalledWith('pipStatusUpdate', pipUpdate);
    });
  });

  describe('Error Handling and Security', () => {
    it('should rate limit command execution', async () => {
      // RED: This test will fail
      mockSocket.data = {
        authenticated: true,
        deviceId: 'device-123',
        userId: 'user-456',
        commandCount: 100, // Exceeded rate limit
        lastReset: Date.now() - 30000 // 30 seconds ago
      };

      const command = { type: 'pip_enable', parameters: {} };

      await handler.handleExecuteCommand(mockSocket, command);

      expect(mockSocket.emit).toHaveBeenCalledWith('commandResult', {
        success: false,
        error: 'Rate limit exceeded. Please slow down.',
        timestamp: expect.any(Date)
      });
      expect(mockMobileRemoteService.executeCommand).not.toHaveBeenCalled();
    });

    it('should validate command parameters', async () => {
      // RED: This test will fail
      mockSocket.data = {
        authenticated: true,
        deviceId: 'device-123',
        userId: 'user-456'
      };

      const invalidCommand = {
        type: 'invalid_command',
        parameters: null
      };

      await handler.handleExecuteCommand(mockSocket, invalidCommand);

      expect(mockSocket.emit).toHaveBeenCalledWith('commandResult', {
        success: false,
        error: 'Invalid command type or parameters',
        timestamp: expect.any(Date)
      });
    });

    it('should handle session expiration during command execution', async () => {
      // RED: This test will fail
      mockSocket.data = {
        authenticated: true,
        deviceId: 'device-123',
        userId: 'user-456'
      };

      const command = { type: 'stream_start', streamId: 'stream-123', parameters: {} };

      mockMobileRemoteService.executeStreamCommand.mockRejectedValue(
        new Error('Session has expired')
      );

      await handler.handleExecuteStreamCommand(mockSocket, command);

      expect(mockSocket.emit).toHaveBeenCalledWith('sessionExpired', {
        reason: 'Session has expired during command execution'
      });
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should log security events', async () => {
      // RED: This test will fail
      mockSocket.handshake.auth = { sessionToken: 'malicious-token' };
      mockSocket.handshake.address = '192.168.1.100';

      mockWebSocketAuthService.validateMobileSession.mockResolvedValue({
        valid: false,
        error: 'Suspicious activity detected'
      });

      await handler.handleConnection(mockSocket, mockIo);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Suspicious mobile connection attempt'),
        expect.objectContaining({
          socketId: 'socket-123',
          ipAddress: '192.168.1.100'
        })
      );
    });
  });

  describe('WebSocket Event Registration', () => {
    it('should register all required event handlers on socket connection', async () => {
      // RED: This test will fail
      mockSocket.data = {
        authenticated: true,
        deviceId: 'device-123',
        userId: 'user-456'
      };

      handler.registerEventHandlers(mockSocket);

      const expectedEvents = [
        'executeCommand',
        'executeStreamCommand', 
        'requestStatus',
        'heartbeat',
        'refreshSession',
        'disconnect'
      ];

      expectedEvents.forEach(event => {
        expect(mockSocket.on).toHaveBeenCalledWith(event, expect.any(Function));
      });
    });

    it('should handle malformed event data gracefully', async () => {
      // RED: This test will fail
      mockSocket.data = {
        authenticated: true,
        deviceId: 'device-123'
      };

      // Simulate malformed JSON data
      const malformedData = { invalidStructure: true };

      await handler.handleExecuteCommand(mockSocket, malformedData);

      expect(mockSocket.emit).toHaveBeenCalledWith('commandResult', {
        success: false,
        error: 'Invalid command format',
        timestamp: expect.any(Date)
      });
    });
  });

  describe('Connection Statistics and Monitoring', () => {
    it('should track active mobile connections', async () => {
      // RED: This test will fail
      const deviceIds = ['device-1', 'device-2', 'device-3'];
      
      deviceIds.forEach((deviceId, index) => {
        const mockSocket = { 
          id: `socket-${index}`, 
          data: { authenticated: true, deviceId } 
        };
        mockIo.sockets.sockets.set(`socket-${index}`, mockSocket as any);
      });

      const activeConnections = handler.getActiveConnections(mockIo);

      expect(activeConnections).toMatchObject({
        total: 3,
        authenticated: 3,
        devices: expect.arrayContaining(deviceIds)
      });
    });

    it('should provide connection statistics for monitoring', async () => {
      // RED: This test will fail
      const stats = await handler.getConnectionStats(mockIo);

      expect(stats).toMatchObject({
        totalConnections: expect.any(Number),
        authenticatedConnections: expect.any(Number),
        commandsExecuted: expect.any(Number),
        averageConnectionTime: expect.any(Number),
        topDeviceTypes: expect.any(Array),
        errorRate: expect.any(Number)
      });
    });
  });
});
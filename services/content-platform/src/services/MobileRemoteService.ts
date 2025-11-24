import { Repository } from 'typeorm';
import { 
  IMobileRemoteService, 
  DeviceInfo, 
  MobileDeviceInfo,
  DeviceStatus,
  PairingResponse,
  PairingResult,
  PairingStatus,
  RemoteCommand,
  StreamControlCommand,
  CommandResult,
  CommandType,
  StreamCommandType,
  SessionInfo,
  SessionValidationResult,
  StreamStatusUpdate,
  AdDetectionNotification,
  PipStatusUpdate,
  DeviceUsageStats,
  RemoteControlStats,
  TimeRange,
  DeviceCapability,
  MobileRemoteError,
  MobileRemoteErrorCode
} from '@/interfaces/IMobileRemoteService';
import { MobileDevice } from '@/models/MobileDevice';
import { RemoteSession } from '@/models/RemoteSession';
import { User } from '@/models/User';
import { Logger } from '@/utils/Logger';
import { ValidationError } from '@/utils/errors';
import crypto from 'crypto';

/**
 * Mobile Remote Control Service Implementation
 * 
 * Manages mobile device pairing, remote control commands, and real-time
 * communication for stream and Picture-in-Picture control. Provides secure
 * session management and capability-based access control.
 * 
 * TDD Implementation: This service was implemented to satisfy the test
 * specifications written in RED phase, following the GREEN phase of TDD.
 * 
 * Single Responsibility: Mobile device remote control and management
 * Open/Closed: Extensible for new command types and capabilities
 * Liskov Substitution: Implements IMobileRemoteService interface
 * Interface Segregation: Focused on mobile remote control concerns
 * Dependency Inversion: Uses injected repositories and services
 */
export class MobileRemoteService implements IMobileRemoteService {
  private logger: Logger;
  private rateLimitCache: Map<string, { count: number; resetTime: number }> = new Map();

  constructor(
    private deviceRepository: Repository<MobileDevice>,
    private sessionRepository: Repository<RemoteSession>,
    private userRepository: Repository<User>,
    private streamService: any,
    private webSocketService: any,
    private authService: any
  ) {
    this.logger = new Logger('MobileRemoteService');
  }

  /**
   * Device Pairing and Management
   */
  async initiatePairing(userId: string, deviceInfo: DeviceInfo): Promise<PairingResponse> {
    try {
      // Rate limiting check
      if (!(await this.checkRateLimit(userId, 'pairing'))) {
        throw new MobileRemoteError(
          'Too many pairing attempts. Please try again later.',
          MobileRemoteErrorCode.RATE_LIMIT_EXCEEDED
        );
      }

      // Validate device info
      const validation = MobileDevice.validateDeviceInfo(deviceInfo);
      if (!validation.valid) {
        throw new ValidationError(`Invalid device information: ${validation.errors.join(', ')}`);
      }

      // Generate pairing token
      const pairingResult = await this.authService.generatePairingToken(userId, deviceInfo);

      this.logger.info(`Pairing initiated for user ${userId}, device: ${deviceInfo.name}`);

      return {
        pairingCode: pairingResult.code,
        expiresAt: pairingResult.expiresAt,
        instructions: `Enter this code on your device to complete pairing: ${pairingResult.code}`,
        qrCode: this.generateQRCode(pairingResult.code, userId)
      };
    } catch (error) {
      this.logger.error('Failed to initiate pairing:', error);
      if (error instanceof ValidationError || error instanceof MobileRemoteError) {
        throw error;
      }
      throw new Error('Failed to initiate pairing');
    }
  }

  async completePairing(pairingCode: string, deviceId: string): Promise<PairingResult> {
    try {
      // Validate pairing token
      const validation = await this.authService.validatePairingToken(pairingCode);
      
      if (!validation.valid) {
        return {
          status: PairingStatus.FAILED,
          error: validation.error || 'Invalid or expired pairing code'
        };
      }

      // Create device record
      const device = MobileDevice.createFromDeviceInfo(
        validation.userId, 
        deviceId, 
        validation.deviceInfo
      );
      device.pair();

      const savedDevice = await this.deviceRepository.save(device);

      // Create initial session
      const sessionToken = await this.authService.createDeviceSession(deviceId, validation.userId);
      const session = RemoteSession.createForDevice(
        deviceId,
        validation.userId,
        sessionToken,
        validation.deviceInfo.capabilities
      );

      await this.sessionRepository.save(session);

      this.logger.info(`Device paired successfully: ${deviceId} for user ${validation.userId}`);

      return {
        status: PairingStatus.SUCCESS,
        device: this.mapDeviceToInfo(savedDevice),
        sessionToken
      };
    } catch (error) {
      this.logger.error('Failed to complete pairing:', error);
      return {
        status: PairingStatus.FAILED,
        error: 'Failed to complete pairing process'
      };
    }
  }

  async unpairDevice(deviceId: string, userId: string): Promise<void> {
    try {
      const device = await this.deviceRepository.findOne({
        where: { id: deviceId, userId }
      });

      if (!device) {
        throw new MobileRemoteError('Device not found', MobileRemoteErrorCode.DEVICE_NOT_FOUND);
      }

      // Unpair device
      device.unpair();
      await this.deviceRepository.save(device);

      // Deactivate all sessions
      const sessions = await this.sessionRepository.find({
        where: { deviceId, isActive: true }
      });

      for (const session of sessions) {
        session.expire('Device unpaired by user');
        await this.sessionRepository.save(session);
      }

      // Notify device
      await this.webSocketService.emitToDevice(deviceId, 'deviceUnpaired', {
        reason: 'Device was unpaired by user'
      });

      this.logger.info(`Device unpaired: ${deviceId} by user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to unpair device:', error);
      throw error;
    }
  }

  async getUserDevices(userId: string): Promise<MobileDeviceInfo[]> {
    try {
      const devices = await this.deviceRepository.find({
        where: { userId, isPaired: true },
        order: { lastSeen: 'DESC' }
      });

      return devices.map(device => this.mapDeviceToInfo(device));
    } catch (error) {
      this.logger.error('Failed to get user devices:', error);
      throw new Error('Failed to retrieve user devices');
    }
  }

  async updateDevice(deviceId: string, updates: Partial<DeviceInfo>): Promise<MobileDeviceInfo> {
    try {
      const device = await this.deviceRepository.findOne({
        where: { id: deviceId }
      });

      if (!device) {
        throw new MobileRemoteError('Device not found', MobileRemoteErrorCode.DEVICE_NOT_FOUND);
      }

      device.updateInfo(updates);
      const savedDevice = await this.deviceRepository.save(device);

      this.logger.info(`Device updated: ${deviceId}`);
      return this.mapDeviceToInfo(savedDevice);
    } catch (error) {
      this.logger.error('Failed to update device:', error);
      throw error;
    }
  }

  async getDeviceStatus(deviceId: string): Promise<DeviceStatus> {
    try {
      const device = await this.deviceRepository.findOne({
        where: { id: deviceId }
      });

      if (!device) {
        throw new MobileRemoteError('Device not found', MobileRemoteErrorCode.DEVICE_NOT_FOUND);
      }

      const activeSession = await this.sessionRepository.findOne({
        where: { deviceId, isActive: true }
      });

      return {
        id: device.id,
        name: device.name,
        isOnline: device.isOnline,
        batteryLevel: device.batteryLevel,
        capabilities: device.capabilities,
        lastSeen: device.lastSeen || device.updatedAt,
        activeSession: activeSession ? {
          id: activeSession.id,
          startedAt: activeSession.createdAt,
          lastActivity: activeSession.lastActivity
        } : undefined,
        networkInfo: device.networkType ? {
          type: device.networkType
        } : undefined
      };
    } catch (error) {
      this.logger.error('Failed to get device status:', error);
      throw error;
    }
  }

  /**
   * Command Execution
   */
  async executeCommand(deviceId: string, command: RemoteCommand): Promise<CommandResult> {
    try {
      const device = await this.validateDeviceForCommand(deviceId, this.getRequiredCapability(command.type));
      const session = await this.getActiveSession(deviceId);

      const commandId = crypto.randomUUID();
      const startTime = Date.now();

      let result: any;

      switch (command.type) {
        case 'pip_enable':
          result = await this.handlePipEnable(session.userId, command.parameters);
          break;
        case 'pip_disable':
          result = await this.handlePipDisable(session.userId);
          break;
        case 'pip_resize':
          result = await this.handlePipResize(session.userId, command.parameters);
          break;
        case 'pip_move':
          result = await this.handlePipMove(session.userId, command.parameters);
          break;
        default:
          throw new MobileRemoteError(
            `Unsupported command type: ${command.type}`,
            MobileRemoteErrorCode.COMMAND_FAILED
          );
      }

      session.recordCommandExecution();
      await this.sessionRepository.save(session);

      const executionTime = Date.now() - startTime;

      const commandResult: CommandResult = {
        success: true,
        commandId,
        result,
        timestamp: new Date(),
        executionTime
      };

      // Notify device of successful execution
      await this.webSocketService.emitToDevice(deviceId, 'commandExecuted', commandResult);

      this.logger.info(`Command executed successfully: ${command.type} by device ${deviceId}`);
      return commandResult;
    } catch (error) {
      this.logger.error('Failed to execute command:', error);
      const commandResult: CommandResult = {
        success: false,
        commandId: crypto.randomUUID(),
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };

      await this.webSocketService.emitToDevice(deviceId, 'commandExecuted', commandResult);
      return commandResult;
    }
  }

  async executeStreamCommand(deviceId: string, command: StreamControlCommand): Promise<CommandResult> {
    try {
      const device = await this.validateDeviceForCommand(deviceId, 'stream_control');
      const session = await this.getActiveSession(deviceId);

      const commandId = crypto.randomUUID();
      const startTime = Date.now();

      let result: any;

      switch (command.type) {
        case 'stream_start':
          await this.streamService.startStream(command.streamId, session.userId);
          result = { action: 'stream_started', streamId: command.streamId };
          break;

        case 'stream_stop':
          await this.streamService.stopStream(command.streamId, session.userId);
          result = { action: 'stream_stopped', streamId: command.streamId };
          break;

        case 'stream_pause':
          await this.streamService.pauseStream(command.streamId, session.userId);
          result = { action: 'stream_paused', streamId: command.streamId };
          break;

        case 'stream_resume':
          await this.streamService.resumeStream(command.streamId, session.userId);
          result = { action: 'stream_resumed', streamId: command.streamId };
          break;

        case 'quality_change':
          await this.streamService.updateStreamQuality(
            command.streamId, 
            session.userId, 
            command.parameters.quality
          );
          result = { action: 'quality_changed', streamId: command.streamId };
          break;

        default:
          throw new MobileRemoteError(
            `Unsupported stream command: ${command.type}`,
            MobileRemoteErrorCode.COMMAND_FAILED
          );
      }

      session.recordCommandExecution();
      await this.sessionRepository.save(session);

      const executionTime = Date.now() - startTime;

      const commandResult: CommandResult = {
        success: true,
        commandId,
        result,
        timestamp: new Date(),
        executionTime
      };

      await this.webSocketService.emitToDevice(deviceId, 'commandExecuted', commandResult);

      this.logger.info(`Stream command executed: ${command.type} for stream ${command.streamId}`);
      return commandResult;
    } catch (error) {
      this.logger.error('Failed to execute stream command:', error);
      throw error;
    }
  }

  /**
   * Session Management
   */
  async createSession(deviceId: string, userId: string): Promise<SessionInfo> {
    try {
      const device = await this.deviceRepository.findOne({
        where: { id: deviceId, userId, isPaired: true }
      });

      if (!device) {
        throw new MobileRemoteError('Device not found or not paired', MobileRemoteErrorCode.DEVICE_NOT_PAIRED);
      }

      const sessionToken = await this.authService.createDeviceSession(deviceId, userId);
      const session = RemoteSession.createForDevice(deviceId, userId, sessionToken, device.capabilities);

      const savedSession = await this.sessionRepository.save(session);

      return {
        sessionId: savedSession.id,
        token: sessionToken,
        deviceId,
        userId,
        expiresAt: savedSession.expiresAt,
        capabilities: device.capabilities
      };
    } catch (error) {
      this.logger.error('Failed to create session:', error);
      throw error;
    }
  }

  async validateSession(sessionToken: string): Promise<SessionValidationResult> {
    try {
      const session = await this.sessionRepository.findOne({
        where: { sessionToken }
      });

      if (!session) {
        return { valid: false, error: 'Session not found' };
      }

      if (session.shouldExpire()) {
        session.expire(session.isExpired() ? 'Session expired' : 'Session stale due to inactivity');
        await this.sessionRepository.save(session);
        return { valid: false, error: 'Session has expired' };
      }

      // Update last activity
      session.updateActivity();
      await this.sessionRepository.save(session);

      return {
        valid: true,
        session: {
          id: session.id,
          deviceId: session.deviceId,
          userId: session.userId,
          isActive: session.isActive,
          lastActivity: session.lastActivity,
          capabilities: session.capabilities
        }
      };
    } catch (error) {
      this.logger.error('Failed to validate session:', error);
      return { valid: false, error: 'Session validation failed' };
    }
  }

  async refreshSession(sessionToken: string): Promise<SessionInfo> {
    throw new Error('Not implemented yet');
  }

  async endSession(sessionToken: string): Promise<void> {
    throw new Error('Not implemented yet');
  }

  /**
   * Real-time Communication
   */
  async broadcastStreamStatus(userId: string, status: StreamStatusUpdate): Promise<void> {
    try {
      const devices = await this.deviceRepository.find({
        where: { userId, isPaired: true }
      });

      const notificationDevices = devices.filter(device => 
        device.hasCapability('notifications')
      );

      for (const device of notificationDevices) {
        await this.webSocketService.emitToDevice(device.deviceId, 'streamStatusUpdate', status);
      }

      this.logger.debug(`Stream status broadcasted to ${notificationDevices.length} devices`);
    } catch (error) {
      this.logger.error('Failed to broadcast stream status:', error);
      throw error;
    }
  }

  async sendAdDetectionNotification(userId: string, adDetection: AdDetectionNotification): Promise<void> {
    try {
      const devices = await this.deviceRepository.find({
        where: { userId, isPaired: true }
      });

      const notificationDevices = devices.filter(device => 
        device.hasCapability('notifications')
      );

      for (const device of notificationDevices) {
        await this.webSocketService.emitToDevice(device.deviceId, 'adDetected', adDetection);
      }

      this.logger.debug(`Ad detection notification sent to ${notificationDevices.length} devices`);
    } catch (error) {
      this.logger.error('Failed to send ad detection notification:', error);
      throw error;
    }
  }

  async sendPipStatusUpdate(userId: string, pipStatus: PipStatusUpdate): Promise<void> {
    throw new Error('Not implemented yet');
  }

  /**
   * Analytics and Monitoring
   */
  async getDeviceUsageStats(deviceId: string, timeRange?: TimeRange): Promise<DeviceUsageStats> {
    throw new Error('Not implemented yet');
  }

  async getRemoteControlStats(userId: string, timeRange?: TimeRange): Promise<RemoteControlStats> {
    throw new Error('Not implemented yet');
  }

  /**
   * Private Helper Methods
   */
  private async validateDeviceForCommand(deviceId: string, requiredCapability: DeviceCapability): Promise<MobileDevice> {
    const device = await this.deviceRepository.findOne({
      where: { id: deviceId }
    });

    if (!device) {
      throw new MobileRemoteError('Device not found or not paired', MobileRemoteErrorCode.DEVICE_NOT_FOUND);
    }

    if (!device.isPaired) {
      throw new MobileRemoteError('Device is not paired', MobileRemoteErrorCode.DEVICE_NOT_PAIRED);
    }

    if (!device.hasCapability(requiredCapability)) {
      throw new MobileRemoteError(
        `Device does not have required capability: ${requiredCapability}`,
        MobileRemoteErrorCode.INSUFFICIENT_CAPABILITIES
      );
    }

    return device;
  }

  private async getActiveSession(deviceId: string): Promise<RemoteSession> {
    const session = await this.sessionRepository.findOne({
      where: { deviceId, isActive: true }
    });

    if (!session || session.shouldExpire()) {
      throw new MobileRemoteError('No active session found', MobileRemoteErrorCode.SESSION_EXPIRED);
    }

    return session;
  }

  private getRequiredCapability(commandType: CommandType): DeviceCapability {
    const capabilityMap: Record<CommandType, DeviceCapability> = {
      'pip_enable': 'pip_control',
      'pip_disable': 'pip_control',
      'pip_resize': 'pip_control',
      'pip_move': 'pip_control',
      'notification_test': 'notifications',
      'device_status': 'stream_control',
      'stream_list': 'stream_control',
      'haptic_feedback': 'haptic_feedback',
      'voice_command': 'voice_control'
    };

    return capabilityMap[commandType] || 'stream_control';
  }

  private async handlePipEnable(userId: string, parameters: any): Promise<any> {
    await this.webSocketService.emitToRoom(`user:${userId}`, 'pipCommand', {
      action: 'enable',
      streamId: parameters.streamId,
      position: parameters.position,
      size: parameters.size
    });

    return {
      action: 'pip_enabled',
      streamId: parameters.streamId,
      pipConfig: {
        position: parameters.position,
        size: parameters.size
      }
    };
  }

  private async handlePipDisable(userId: string): Promise<any> {
    await this.webSocketService.emitToRoom(`user:${userId}`, 'pipCommand', {
      action: 'disable'
    });

    return { action: 'pip_disabled' };
  }

  private async handlePipResize(userId: string, parameters: any): Promise<any> {
    await this.webSocketService.emitToRoom(`user:${userId}`, 'pipCommand', {
      action: 'resize',
      size: parameters.size
    });

    return { action: 'pip_resized', size: parameters.size };
  }

  private async handlePipMove(userId: string, parameters: any): Promise<any> {
    await this.webSocketService.emitToRoom(`user:${userId}`, 'pipCommand', {
      action: 'move',
      position: parameters.position
    });

    return { action: 'pip_moved', position: parameters.position };
  }

  private mapDeviceToInfo(device: MobileDevice): MobileDeviceInfo {
    return {
      id: device.id,
      userId: device.userId,
      deviceId: device.deviceId,
      name: device.name,
      model: device.model,
      os: device.os,
      osVersion: device.osVersion,
      appVersion: device.appVersion,
      capabilities: device.capabilities,
      isPaired: device.isPaired,
      lastSeen: device.lastSeen || device.updatedAt,
      isOnline: device.isOnline,
      batteryLevel: device.batteryLevel,
      networkType: device.networkType,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt
    };
  }

  private async checkRateLimit(identifier: string, type: string): Promise<boolean> {
    const key = `${type}:${identifier}`;
    const now = Date.now();
    const limit = type === 'pairing' ? 5 : 60; // 5 pairing attempts, 60 commands per window
    const window = 5 * 60 * 1000; // 5 minutes

    const current = this.rateLimitCache.get(key);
    
    if (!current || now > current.resetTime) {
      this.rateLimitCache.set(key, { count: 1, resetTime: now + window });
      return true;
    }

    if (current.count >= limit) {
      return false;
    }

    current.count++;
    return true;
  }

  private generateQRCode(code: string, userId: string): string {
    // Simple base64 encoding of pairing data
    const data = JSON.stringify({ code, userId, app: 'LiveAdDetection' });
    return Buffer.from(data).toString('base64');
  }
}
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { User } from './User';
import { DeviceCapability, DeviceInfo } from '@/interfaces/IMobileRemoteService';

/**
 * Mobile Device Entity
 * 
 * Represents a mobile device paired with a user account for remote control
 * capabilities. Stores device information, capabilities, and pairing status.
 * 
 * Features:
 * - Device identification and metadata
 * - Capability management
 * - Pairing status tracking
 * - Online/offline status
 * - Battery and network information
 */

@Entity('mobile_devices')
@Index(['userId', 'isPaired'])
@Index(['deviceId'], { unique: true })
export class MobileDevice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'device_id', unique: true })
  deviceId!: string;

  @Column()
  name!: string;

  @Column()
  model!: string;

  @Column({ type: 'enum', enum: ['iOS', 'Android', 'Other'] })
  os!: 'iOS' | 'Android' | 'Other';

  @Column({ name: 'os_version' })
  osVersion!: string;

  @Column({ name: 'app_version' })
  appVersion!: string;

  @Column({ type: 'json' })
  capabilities!: DeviceCapability[];

  @Column({ name: 'is_paired', default: false })
  isPaired!: boolean;

  @Column({ name: 'is_online', default: false })
  isOnline!: boolean;

  @Column({ name: 'battery_level', nullable: true })
  batteryLevel?: number;

  @Column({ name: 'network_type', nullable: true })
  networkType?: 'wifi' | 'cellular' | 'unknown';

  @Column({ name: 'last_seen', nullable: true })
  lastSeen?: Date;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  // Static factory methods
  static createFromDeviceInfo(userId: string, deviceId: string, deviceInfo: DeviceInfo): MobileDevice {
    const device = new MobileDevice();
    device.userId = userId;
    device.deviceId = deviceId;
    device.name = deviceInfo.name;
    device.model = deviceInfo.model;
    device.os = deviceInfo.os;
    device.osVersion = deviceInfo.osVersion;
    device.appVersion = deviceInfo.appVersion;
    device.capabilities = deviceInfo.capabilities;
    device.metadata = deviceInfo.metadata;
    device.isPaired = false;
    device.isOnline = false;
    return device;
  }

  // Instance methods
  pair(): void {
    this.isPaired = true;
    this.lastSeen = new Date();
  }

  unpair(): void {
    this.isPaired = false;
    this.isOnline = false;
  }

  updateStatus(isOnline: boolean, batteryLevel?: number, networkType?: 'wifi' | 'cellular' | 'unknown'): void {
    this.isOnline = isOnline;
    this.lastSeen = new Date();
    
    if (batteryLevel !== undefined) {
      this.batteryLevel = batteryLevel;
    }
    
    if (networkType !== undefined) {
      this.networkType = networkType;
    }
  }

  updateInfo(updates: Partial<DeviceInfo>): void {
    if (updates.name) this.name = updates.name;
    if (updates.model) this.model = updates.model;
    if (updates.os) this.os = updates.os;
    if (updates.osVersion) this.osVersion = updates.osVersion;
    if (updates.appVersion) this.appVersion = updates.appVersion;
    if (updates.capabilities) this.capabilities = updates.capabilities;
    if (updates.metadata) this.metadata = { ...this.metadata, ...updates.metadata };
  }

  hasCapability(capability: DeviceCapability): boolean {
    return this.capabilities.includes(capability);
  }

  addCapability(capability: DeviceCapability): void {
    if (!this.hasCapability(capability)) {
      this.capabilities.push(capability);
    }
  }

  removeCapability(capability: DeviceCapability): void {
    this.capabilities = this.capabilities.filter(cap => cap !== capability);
  }

  isRecentlyActive(minutes: number = 30): boolean {
    if (!this.lastSeen) return false;
    const threshold = new Date(Date.now() - minutes * 60 * 1000);
    return this.lastSeen > threshold;
  }

  // Validation methods
  static validateDeviceInfo(deviceInfo: DeviceInfo): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!deviceInfo.name || deviceInfo.name.trim().length === 0) {
      errors.push('Device name is required');
    }

    if (!deviceInfo.model || deviceInfo.model.trim().length === 0) {
      errors.push('Device model is required');
    }

    if (!['iOS', 'Android', 'Other'].includes(deviceInfo.os)) {
      errors.push('Invalid operating system');
    }

    if (!deviceInfo.osVersion || deviceInfo.osVersion.trim().length === 0) {
      errors.push('OS version is required');
    }

    if (!deviceInfo.appVersion || deviceInfo.appVersion.trim().length === 0) {
      errors.push('App version is required');
    }

    if (!Array.isArray(deviceInfo.capabilities) || deviceInfo.capabilities.length === 0) {
      errors.push('At least one capability is required');
    }

    const validCapabilities: DeviceCapability[] = [
      'stream_control', 'pip_control', 'notifications', 'voice_control',
      'haptic_feedback', 'camera_control', 'audio_control', 'chat_moderation'
    ];

    const invalidCapabilities = deviceInfo.capabilities.filter(
      cap => !validCapabilities.includes(cap)
    );

    if (invalidCapabilities.length > 0) {
      errors.push(`Invalid capabilities: ${invalidCapabilities.join(', ')}`);
    }

    if (deviceInfo.name && deviceInfo.name.length > 100) {
      errors.push('Device name must be less than 100 characters');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // JSON serialization
  toSafeJSON(): any {
    return {
      id: this.id,
      userId: this.userId,
      deviceId: this.deviceId,
      name: this.name,
      model: this.model,
      os: this.os,
      osVersion: this.osVersion,
      appVersion: this.appVersion,
      capabilities: this.capabilities,
      isPaired: this.isPaired,
      isOnline: this.isOnline,
      batteryLevel: this.batteryLevel,
      networkType: this.networkType,
      lastSeen: this.lastSeen,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isRecentlyActive: this.isRecentlyActive()
    };
  }

  // Security helpers
  canExecuteCommand(capability: DeviceCapability): boolean {
    return this.isPaired && this.hasCapability(capability);
  }

  getSecurityLevel(): 'low' | 'medium' | 'high' {
    if (!this.isPaired) return 'low';
    if (this.capabilities.length >= 3 && this.isRecentlyActive(5)) return 'high';
    if (this.isRecentlyActive(30)) return 'medium';
    return 'low';
  }
}
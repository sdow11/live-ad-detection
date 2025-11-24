import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, BeforeInsert, BeforeUpdate } from 'typeorm';
import { User } from './User';
import { StreamState, StreamHealth } from '@/interfaces/IStreamService';

/**
 * Stream Entity
 * 
 * Represents a live stream with configuration, status, and metadata
 * Supports stream lifecycle management and real-time monitoring
 * 
 * Single Responsibility: Stream data management
 * Open/Closed: Extensible for new stream types via metadata
 * Liskov Substitution: Standard entity pattern
 * Interface Segregation: Focused on stream concerns
 * Dependency Inversion: Uses standard ORM patterns
 */

@Entity('streams')
export class Stream {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: StreamState,
    default: StreamState.IDLE
  })
  status: StreamState;

  @Column({
    type: 'enum',
    enum: StreamHealth,
    default: StreamHealth.GOOD
  })
  health: StreamHealth;

  // Stream Quality Configuration
  @Column({ length: 50 })
  resolution: string; // e.g., "1920x1080"

  @Column({ type: 'int' })
  bitrate: number; // kbps

  @Column({ type: 'int' })
  framerate: number; // fps

  @Column({ length: 50 })
  codec: string; // e.g., "h264"

  // Stream Settings
  @Column({ name: 'is_public', default: true })
  isPublic: boolean;

  @Column({ name: 'recording_enabled', default: false })
  recordingEnabled: boolean;

  @Column({ name: 'ad_detection_enabled', default: true })
  adDetectionEnabled: boolean;

  @Column({ name: 'max_viewers', type: 'int', nullable: true })
  maxViewers: number | null;

  @Column({ name: 'current_viewers', type: 'int', default: 0 })
  currentViewers: number;

  // Stream URLs
  @Column({ name: 'stream_url', length: 500, nullable: true })
  streamUrl: string | null;

  @Column({ name: 'rtmp_url', length: 500, nullable: true })
  rtmpUrl: string | null;

  @Column({ name: 'thumbnail_url', length: 500, nullable: true })
  thumbnailUrl: string | null;

  // Stream Metadata
  @Column({ type: 'json', nullable: true })
  tags: string[] | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  // Stream Timing
  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'ended_at', type: 'timestamp', nullable: true })
  endedAt: Date | null;

  @Column({ name: 'last_health_check', type: 'timestamp', nullable: true })
  lastHealthCheck: Date | null;

  @Column({ type: 'int', nullable: true })
  uptime: number | null; // seconds

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @BeforeInsert()
  @BeforeUpdate()
  generateUrls(): void {
    if (!this.streamUrl && this.id) {
      this.streamUrl = `https://stream.example.com/live/${this.id}`;
      this.rtmpUrl = `rtmp://ingest.example.com/live/${this.id}`;
    }
  }

  /**
   * Check if stream is currently live
   */
  isLive(): boolean {
    return this.status === StreamState.LIVE;
  }

  /**
   * Check if stream is active (live or paused)
   */
  isActive(): boolean {
    return [StreamState.LIVE, StreamState.PAUSED].includes(this.status);
  }

  /**
   * Check if stream can be started
   */
  canStart(): boolean {
    return [StreamState.IDLE, StreamState.STOPPED].includes(this.status);
  }

  /**
   * Check if stream can be stopped
   */
  canStop(): boolean {
    return [StreamState.LIVE, StreamState.PAUSED, StreamState.STARTING].includes(this.status);
  }

  /**
   * Check if stream can be paused
   */
  canPause(): boolean {
    return this.status === StreamState.LIVE;
  }

  /**
   * Check if stream can be resumed
   */
  canResume(): boolean {
    return this.status === StreamState.PAUSED;
  }

  /**
   * Get stream duration in seconds
   */
  getDuration(): number | null {
    if (!this.startedAt) return null;
    
    const endTime = this.endedAt || new Date();
    return Math.floor((endTime.getTime() - this.startedAt.getTime()) / 1000);
  }

  /**
   * Check if stream health is concerning
   */
  hasHealthIssues(): boolean {
    return [StreamHealth.POOR, StreamHealth.CRITICAL].includes(this.health);
  }

  /**
   * Get stream quality description
   */
  getQualityDescription(): string {
    return `${this.resolution} @ ${this.bitrate}kbps, ${this.framerate}fps (${this.codec})`;
  }

  /**
   * Update stream health and check time
   */
  updateHealth(health: StreamHealth, errorMessage?: string): void {
    this.health = health;
    this.lastHealthCheck = new Date();
    this.errorMessage = errorMessage || null;
    
    if (health === StreamHealth.CRITICAL) {
      this.status = StreamState.ERROR;
    }
  }

  /**
   * Start stream session
   */
  startSession(): void {
    if (!this.canStart()) {
      throw new Error(`Cannot start stream in ${this.status} state`);
    }
    
    this.status = StreamState.STARTING;
    this.startedAt = new Date();
    this.endedAt = null;
    this.uptime = 0;
    this.errorMessage = null;
  }

  /**
   * Complete stream start
   */
  completeStart(): void {
    if (this.status !== StreamState.STARTING) {
      throw new Error(`Cannot complete start for stream in ${this.status} state`);
    }
    
    this.status = StreamState.LIVE;
  }

  /**
   * Pause stream
   */
  pause(): void {
    if (!this.canPause()) {
      throw new Error(`Cannot pause stream in ${this.status} state`);
    }
    
    this.status = StreamState.PAUSED;
  }

  /**
   * Resume stream
   */
  resume(): void {
    if (!this.canResume()) {
      throw new Error(`Cannot resume stream in ${this.status} state`);
    }
    
    this.status = StreamState.LIVE;
  }

  /**
   * Stop stream session
   */
  stopSession(): void {
    if (!this.canStop()) {
      throw new Error(`Cannot stop stream in ${this.status} state`);
    }
    
    this.status = StreamState.STOPPING;
    this.endedAt = new Date();
  }

  /**
   * Complete stream stop
   */
  completeStop(): void {
    if (this.status !== StreamState.STOPPING) {
      throw new Error(`Cannot complete stop for stream in ${this.status} state`);
    }
    
    this.status = StreamState.STOPPED;
    this.currentViewers = 0;
  }

  /**
   * Add viewer to stream
   */
  addViewer(): void {
    if (this.maxViewers && this.currentViewers >= this.maxViewers) {
      throw new Error('Stream has reached maximum viewer limit');
    }
    
    this.currentViewers += 1;
  }

  /**
   * Remove viewer from stream
   */
  removeViewer(): void {
    if (this.currentViewers > 0) {
      this.currentViewers -= 1;
    }
  }

  /**
   * Convert to safe JSON for API responses
   */
  toSafeJSON(): {
    id: string;
    title: string;
    description: string | null;
    userId: string;
    status: StreamState;
    health: StreamHealth;
    resolution: string;
    bitrate: number;
    framerate: number;
    codec: string;
    isPublic: boolean;
    recordingEnabled: boolean;
    adDetectionEnabled: boolean;
    maxViewers: number | null;
    currentViewers: number;
    streamUrl: string | null;
    rtmpUrl: string | null;
    thumbnailUrl: string | null;
    tags: string[] | null;
    startedAt: Date | null;
    endedAt: Date | null;
    lastHealthCheck: Date | null;
    uptime: number | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  } {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      userId: this.userId,
      status: this.status,
      health: this.health,
      resolution: this.resolution,
      bitrate: this.bitrate,
      framerate: this.framerate,
      codec: this.codec,
      isPublic: this.isPublic,
      recordingEnabled: this.recordingEnabled,
      adDetectionEnabled: this.adDetectionEnabled,
      maxViewers: this.maxViewers,
      currentViewers: this.currentViewers,
      streamUrl: this.streamUrl,
      rtmpUrl: this.rtmpUrl,
      thumbnailUrl: this.thumbnailUrl,
      tags: this.tags,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      lastHealthCheck: this.lastHealthCheck,
      uptime: this.uptime,
      errorMessage: this.errorMessage,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Validate stream configuration
   */
  static validateConfiguration(config: {
    title: string;
    resolution: string;
    bitrate: number;
    framerate: number;
    codec: string;
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.title || config.title.trim().length === 0) {
      errors.push('Stream title is required');
    }

    if (config.title && config.title.length > 255) {
      errors.push('Stream title must be 255 characters or less');
    }

    const resolutionPattern = /^\d+x\d+$/;
    if (!config.resolution || !resolutionPattern.test(config.resolution)) {
      errors.push('Invalid resolution format. Expected format: WIDTHxHEIGHT (e.g., 1920x1080)');
    }

    if (!config.bitrate || config.bitrate < 100 || config.bitrate > 50000) {
      errors.push('Bitrate must be between 100 and 50000 kbps');
    }

    if (!config.framerate || config.framerate < 10 || config.framerate > 60) {
      errors.push('Framerate must be between 10 and 60 fps');
    }

    const validCodecs = ['h264', 'h265', 'vp8', 'vp9', 'av1'];
    if (!config.codec || !validCodecs.includes(config.codec)) {
      errors.push(`Codec must be one of: ${validCodecs.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
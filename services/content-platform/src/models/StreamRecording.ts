import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Stream } from './Stream';
import { User } from './User';

/**
 * Stream Recording Entity
 * 
 * Represents a recorded stream with metadata and ad detection data
 * Supports recording management and playback
 * 
 * Single Responsibility: Recording data management
 * Open/Closed: Extensible for new recording formats via metadata
 * Liskov Substitution: Standard entity pattern
 * Interface Segregation: Focused on recording concerns
 * Dependency Inversion: Uses standard ORM patterns
 */

@Entity('stream_recordings')
export class StreamRecording {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'stream_id' })
  streamId: string;

  @ManyToOne(() => Stream, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stream_id' })
  stream: Stream;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'int' })
  duration: number; // seconds

  @Column({ name: 'file_size', type: 'bigint' })
  fileSize: number; // bytes

  // Quality Information
  @Column({ length: 50 })
  resolution: string;

  @Column({ type: 'int' })
  bitrate: number; // kbps

  @Column({ type: 'int' })
  framerate: number; // fps

  @Column({ length: 50 })
  codec: string;

  // URLs
  @Column({ name: 'recording_url', length: 500 })
  recordingUrl: string;

  @Column({ name: 'thumbnail_url', length: 500, nullable: true })
  thumbnailUrl: string | null;

  // Ad Detection Data
  @Column({ name: 'ad_detections', type: 'json' })
  adDetections: Array<{
    timestamp: number; // seconds from start
    type: string;
    confidence: number;
    metadata?: Record<string, any>;
  }>;

  // Processing Status
  @Column({
    name: 'processing_status',
    type: 'enum',
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  })
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';

  @Column({ name: 'processing_error', type: 'text', nullable: true })
  processingError: string | null;

  @Column({ name: 'processing_started_at', type: 'timestamp', nullable: true })
  processingStartedAt: Date | null;

  @Column({ name: 'processing_completed_at', type: 'timestamp', nullable: true })
  processingCompletedAt: Date | null;

  // Metadata
  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Check if recording is ready for playback
   */
  isReady(): boolean {
    return this.processingStatus === 'completed';
  }

  /**
   * Check if recording is currently being processed
   */
  isProcessing(): boolean {
    return this.processingStatus === 'processing';
  }

  /**
   * Check if recording processing failed
   */
  hasFailed(): boolean {
    return this.processingStatus === 'failed';
  }

  /**
   * Get processing duration in seconds
   */
  getProcessingDuration(): number | null {
    if (!this.processingStartedAt) return null;
    
    const endTime = this.processingCompletedAt || new Date();
    return Math.floor((endTime.getTime() - this.processingStartedAt.getTime()) / 1000);
  }

  /**
   * Get file size in human readable format
   */
  getFileSizeFormatted(): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = this.fileSize;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Get duration in human readable format
   */
  getDurationFormatted(): string {
    const hours = Math.floor(this.duration / 3600);
    const minutes = Math.floor((this.duration % 3600) / 60);
    const seconds = this.duration % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Get quality description
   */
  getQualityDescription(): string {
    return `${this.resolution} @ ${this.bitrate}kbps, ${this.framerate}fps (${this.codec})`;
  }

  /**
   * Get ad detection summary
   */
  getAdDetectionSummary(): {
    total: number;
    types: Record<string, number>;
    averageConfidence: number;
    timeline: Array<{ timestamp: number; type: string; confidence: number }>;
  } {
    if (!this.adDetections || this.adDetections.length === 0) {
      return {
        total: 0,
        types: {},
        averageConfidence: 0,
        timeline: []
      };
    }

    const types: Record<string, number> = {};
    let totalConfidence = 0;

    for (const detection of this.adDetections) {
      types[detection.type] = (types[detection.type] || 0) + 1;
      totalConfidence += detection.confidence;
    }

    return {
      total: this.adDetections.length,
      types,
      averageConfidence: totalConfidence / this.adDetections.length,
      timeline: this.adDetections.map(d => ({
        timestamp: d.timestamp,
        type: d.type,
        confidence: d.confidence
      }))
    };
  }

  /**
   * Start processing
   */
  startProcessing(): void {
    if (this.processingStatus !== 'pending') {
      throw new Error(`Cannot start processing for recording with status: ${this.processingStatus}`);
    }

    this.processingStatus = 'processing';
    this.processingStartedAt = new Date();
    this.processingError = null;
  }

  /**
   * Complete processing successfully
   */
  completeProcessing(): void {
    if (this.processingStatus !== 'processing') {
      throw new Error(`Cannot complete processing for recording with status: ${this.processingStatus}`);
    }

    this.processingStatus = 'completed';
    this.processingCompletedAt = new Date();
    this.processingError = null;
  }

  /**
   * Mark processing as failed
   */
  failProcessing(error: string): void {
    if (this.processingStatus !== 'processing') {
      throw new Error(`Cannot fail processing for recording with status: ${this.processingStatus}`);
    }

    this.processingStatus = 'failed';
    this.processingCompletedAt = new Date();
    this.processingError = error;
  }

  /**
   * Add ad detection result
   */
  addAdDetection(timestamp: number, type: string, confidence: number, metadata?: Record<string, any>): void {
    if (!this.adDetections) {
      this.adDetections = [];
    }

    this.adDetections.push({
      timestamp,
      type,
      confidence,
      metadata
    });

    // Sort by timestamp
    this.adDetections.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Convert to safe JSON for API responses
   */
  toSafeJSON(): {
    id: string;
    streamId: string;
    userId: string;
    title: string;
    duration: number;
    fileSize: number;
    resolution: string;
    bitrate: number;
    framerate: number;
    codec: string;
    recordingUrl: string;
    thumbnailUrl: string | null;
    adDetections: Array<{
      timestamp: number;
      type: string;
      confidence: number;
      metadata?: Record<string, any>;
    }>;
    processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
    processingError: string | null;
    createdAt: Date;
    updatedAt: Date;
  } {
    return {
      id: this.id,
      streamId: this.streamId,
      userId: this.userId,
      title: this.title,
      duration: this.duration,
      fileSize: this.fileSize,
      resolution: this.resolution,
      bitrate: this.bitrate,
      framerate: this.framerate,
      codec: this.codec,
      recordingUrl: this.recordingUrl,
      thumbnailUrl: this.thumbnailUrl,
      adDetections: this.adDetections,
      processingStatus: this.processingStatus,
      processingError: this.processingError,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Create recording from stream
   */
  static createFromStream(stream: Stream, duration: number, fileSize: number, recordingUrl: string): StreamRecording {
    const recording = new StreamRecording();
    recording.streamId = stream.id;
    recording.userId = stream.userId;
    recording.title = `${stream.title} - ${new Date().toLocaleDateString()}`;
    recording.duration = duration;
    recording.fileSize = fileSize;
    recording.resolution = stream.resolution;
    recording.bitrate = stream.bitrate;
    recording.framerate = stream.framerate;
    recording.codec = stream.codec;
    recording.recordingUrl = recordingUrl;
    recording.adDetections = [];
    recording.processingStatus = 'pending';

    return recording;
  }
}
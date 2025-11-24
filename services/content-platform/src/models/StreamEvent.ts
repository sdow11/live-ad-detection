import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Stream } from './Stream';
import { StreamEventType } from '@/interfaces/IStreamService';

/**
 * Stream Event Entity
 * 
 * Represents events that occur during stream lifecycle
 * Used for logging, analytics, and real-time notifications
 * 
 * Single Responsibility: Event data storage
 * Open/Closed: Extensible for new event types via data field
 * Liskov Substitution: Standard entity pattern
 * Interface Segregation: Focused on event concerns
 * Dependency Inversion: Uses standard ORM patterns
 */

@Entity('stream_events')
export class StreamEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'stream_id' })
  streamId: string;

  @ManyToOne(() => Stream, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stream_id' })
  stream: Stream;

  @Column({
    type: 'enum',
    enum: StreamEventType
  })
  type: StreamEventType;

  @Column({ type: 'json' })
  data: Record<string, any>;

  @CreateDateColumn()
  timestamp: Date;

  /**
   * Check if event is critical (requires immediate attention)
   */
  isCritical(): boolean {
    return [
      StreamEventType.ERROR_OCCURRED,
      StreamEventType.HEALTH_UPDATED
    ].includes(this.type) && this.data.severity === 'critical';
  }

  /**
   * Check if event is user-facing (should be shown in UI)
   */
  isUserFacing(): boolean {
    return [
      StreamEventType.STREAM_STARTED,
      StreamEventType.STREAM_STOPPED,
      StreamEventType.STREAM_PAUSED,
      StreamEventType.STREAM_RESUMED,
      StreamEventType.RECORDING_STARTED,
      StreamEventType.RECORDING_STOPPED,
      StreamEventType.ERROR_OCCURRED
    ].includes(this.type);
  }

  /**
   * Get event description for display
   */
  getDescription(): string {
    switch (this.type) {
      case StreamEventType.STREAM_STARTED:
        return 'Stream started';
      case StreamEventType.STREAM_STOPPED:
        return 'Stream stopped';
      case StreamEventType.STREAM_PAUSED:
        return 'Stream paused';
      case StreamEventType.STREAM_RESUMED:
        return 'Stream resumed';
      case StreamEventType.VIEWER_JOINED:
        return `Viewer joined (${this.data.viewerId})`;
      case StreamEventType.VIEWER_LEFT:
        return `Viewer left (${this.data.viewerId})`;
      case StreamEventType.QUALITY_CHANGED:
        return `Quality changed to ${this.data.resolution}`;
      case StreamEventType.AD_DETECTED:
        return `Ad detected: ${this.data.adType} (confidence: ${Math.round(this.data.confidence * 100)}%)`;
      case StreamEventType.HEALTH_UPDATED:
        return `Stream health updated: ${this.data.health}`;
      case StreamEventType.RECORDING_STARTED:
        return 'Recording started';
      case StreamEventType.RECORDING_STOPPED:
        return 'Recording stopped';
      case StreamEventType.ERROR_OCCURRED:
        return `Error: ${this.data.message}`;
      default:
        return `Unknown event: ${this.type}`;
    }
  }

  /**
   * Convert to safe JSON for API responses
   */
  toSafeJSON(): {
    id: string;
    streamId: string;
    type: StreamEventType;
    data: Record<string, any>;
    timestamp: Date;
    description: string;
    isCritical: boolean;
    isUserFacing: boolean;
  } {
    return {
      id: this.id,
      streamId: this.streamId,
      type: this.type,
      data: this.data,
      timestamp: this.timestamp,
      description: this.getDescription(),
      isCritical: this.isCritical(),
      isUserFacing: this.isUserFacing()
    };
  }

  /**
   * Create stream started event
   */
  static createStreamStarted(streamId: string, userId: string): StreamEvent {
    const event = new StreamEvent();
    event.streamId = streamId;
    event.type = StreamEventType.STREAM_STARTED;
    event.data = { userId, timestamp: new Date().toISOString() };
    return event;
  }

  /**
   * Create stream stopped event
   */
  static createStreamStopped(streamId: string, userId: string, duration?: number): StreamEvent {
    const event = new StreamEvent();
    event.streamId = streamId;
    event.type = StreamEventType.STREAM_STOPPED;
    event.data = { 
      userId, 
      duration, 
      timestamp: new Date().toISOString() 
    };
    return event;
  }

  /**
   * Create viewer joined event
   */
  static createViewerJoined(streamId: string, viewerId: string): StreamEvent {
    const event = new StreamEvent();
    event.streamId = streamId;
    event.type = StreamEventType.VIEWER_JOINED;
    event.data = { 
      viewerId, 
      timestamp: new Date().toISOString() 
    };
    return event;
  }

  /**
   * Create viewer left event
   */
  static createViewerLeft(streamId: string, viewerId: string): StreamEvent {
    const event = new StreamEvent();
    event.streamId = streamId;
    event.type = StreamEventType.VIEWER_LEFT;
    event.data = { 
      viewerId, 
      timestamp: new Date().toISOString() 
    };
    return event;
  }

  /**
   * Create ad detected event
   */
  static createAdDetected(streamId: string, adType: string, confidence: number, metadata?: Record<string, any>): StreamEvent {
    const event = new StreamEvent();
    event.streamId = streamId;
    event.type = StreamEventType.AD_DETECTED;
    event.data = { 
      adType, 
      confidence, 
      metadata,
      timestamp: new Date().toISOString() 
    };
    return event;
  }

  /**
   * Create health updated event
   */
  static createHealthUpdated(streamId: string, health: string, previousHealth?: string): StreamEvent {
    const event = new StreamEvent();
    event.streamId = streamId;
    event.type = StreamEventType.HEALTH_UPDATED;
    event.data = { 
      health, 
      previousHealth,
      severity: ['poor', 'critical'].includes(health.toLowerCase()) ? 'critical' : 'info',
      timestamp: new Date().toISOString() 
    };
    return event;
  }

  /**
   * Create error occurred event
   */
  static createErrorOccurred(streamId: string, message: string, error?: any): StreamEvent {
    const event = new StreamEvent();
    event.streamId = streamId;
    event.type = StreamEventType.ERROR_OCCURRED;
    event.data = { 
      message, 
      error: error?.message || error,
      severity: 'critical',
      timestamp: new Date().toISOString() 
    };
    return event;
  }

  /**
   * Create quality changed event
   */
  static createQualityChanged(streamId: string, resolution: string, bitrate: number, previousResolution?: string): StreamEvent {
    const event = new StreamEvent();
    event.streamId = streamId;
    event.type = StreamEventType.QUALITY_CHANGED;
    event.data = { 
      resolution, 
      bitrate,
      previousResolution,
      timestamp: new Date().toISOString() 
    };
    return event;
  }

  /**
   * Create recording started event
   */
  static createRecordingStarted(streamId: string, recordingId: string): StreamEvent {
    const event = new StreamEvent();
    event.streamId = streamId;
    event.type = StreamEventType.RECORDING_STARTED;
    event.data = { 
      recordingId,
      timestamp: new Date().toISOString() 
    };
    return event;
  }

  /**
   * Create recording stopped event
   */
  static createRecordingStopped(streamId: string, recordingId: string, duration: number, fileSize: number): StreamEvent {
    const event = new StreamEvent();
    event.streamId = streamId;
    event.type = StreamEventType.RECORDING_STOPPED;
    event.data = { 
      recordingId,
      duration,
      fileSize,
      timestamp: new Date().toISOString() 
    };
    return event;
  }
}
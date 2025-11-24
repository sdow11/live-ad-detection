/**
 * Stream Service Interface
 * 
 * Defines the contract for live stream management operations
 * Supports stream lifecycle, quality control, and real-time monitoring
 */

export interface StreamConfiguration {
  id: string;
  title: string;
  description?: string;
  quality: StreamQuality;
  isPublic: boolean;
  recordingEnabled: boolean;
  adDetectionEnabled: boolean;
  maxViewers?: number;
  tags?: string[];
}

export interface StreamQuality {
  resolution: string; // e.g., "1920x1080", "1280x720"
  bitrate: number; // kbps
  framerate: number; // fps
  codec: string; // e.g., "h264", "h265"
}

export interface StreamMetadata {
  id: string;
  title: string;
  description?: string;
  userId: string;
  status: StreamStatus;
  quality: StreamQuality;
  isPublic: boolean;
  recordingEnabled: boolean;
  adDetectionEnabled: boolean;
  maxViewers?: number;
  currentViewers: number;
  tags: string[];
  thumbnailUrl?: string;
  streamUrl?: string;
  rtmpUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  endedAt?: Date;
}

export interface StreamStatus {
  state: StreamState;
  health: StreamHealth;
  uptime?: number; // seconds
  lastHealthCheck?: Date;
  errorMessage?: string;
}

export enum StreamState {
  IDLE = 'idle',
  STARTING = 'starting',
  LIVE = 'live',
  PAUSED = 'paused',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  ERROR = 'error'
}

export enum StreamHealth {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  FAIR = 'fair',
  POOR = 'poor',
  CRITICAL = 'critical'
}

export interface StreamStats {
  streamId: string;
  currentViewers: number;
  totalViews: number;
  averageViewDuration: number; // seconds
  peakViewers: number;
  bandwidth: {
    upload: number; // kbps
    download: number; // kbps
  };
  quality: {
    droppedFrames: number;
    fps: number;
    bitrate: number;
  };
  adDetections: {
    total: number;
    lastDetection?: Date;
    averageConfidence: number;
  };
  recordingSize?: number; // bytes
  startTime: Date;
  lastUpdate: Date;
}

export interface StreamDiscovery {
  streams: StreamMetadata[];
  totalCount: number;
  page: number;
  limit: number;
  filters: StreamFilters;
}

export interface StreamFilters {
  status?: StreamState[];
  isPublic?: boolean;
  userId?: string;
  tags?: string[];
  quality?: {
    minResolution?: string;
    maxResolution?: string;
    minBitrate?: number;
    maxBitrate?: number;
  };
  search?: string;
  sortBy?: 'createdAt' | 'startedAt' | 'viewers' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface StreamQuery {
  page?: number;
  limit?: number;
  filters?: StreamFilters;
}

export interface StreamRecording {
  id: string;
  streamId: string;
  userId: string;
  title: string;
  duration: number; // seconds
  fileSize: number; // bytes
  quality: StreamQuality;
  thumbnailUrl?: string;
  recordingUrl: string;
  adDetections: Array<{
    timestamp: number; // seconds from start
    type: string;
    confidence: number;
    metadata?: Record<string, any>;
  }>;
  createdAt: Date;
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface StreamEvent {
  id: string;
  streamId: string;
  type: StreamEventType;
  data: Record<string, any>;
  timestamp: Date;
}

export enum StreamEventType {
  STREAM_STARTED = 'stream_started',
  STREAM_STOPPED = 'stream_stopped',
  STREAM_PAUSED = 'stream_paused',
  STREAM_RESUMED = 'stream_resumed',
  VIEWER_JOINED = 'viewer_joined',
  VIEWER_LEFT = 'viewer_left',
  QUALITY_CHANGED = 'quality_changed',
  AD_DETECTED = 'ad_detected',
  HEALTH_UPDATED = 'health_updated',
  RECORDING_STARTED = 'recording_started',
  RECORDING_STOPPED = 'recording_stopped',
  ERROR_OCCURRED = 'error_occurred'
}

export interface IStreamService {
  /**
   * Stream Lifecycle Management
   */
  createStream(config: Omit<StreamConfiguration, 'id'>, userId: string): Promise<StreamMetadata>;
  startStream(streamId: string, userId: string): Promise<void>;
  stopStream(streamId: string, userId: string): Promise<void>;
  pauseStream(streamId: string, userId: string): Promise<void>;
  resumeStream(streamId: string, userId: string): Promise<void>;
  deleteStream(streamId: string, userId: string): Promise<void>;

  /**
   * Stream Configuration
   */
  updateStreamConfig(streamId: string, userId: string, config: Partial<StreamConfiguration>): Promise<StreamMetadata>;
  updateStreamQuality(streamId: string, userId: string, quality: StreamQuality): Promise<void>;

  /**
   * Stream Discovery & Retrieval
   */
  getStream(streamId: string): Promise<StreamMetadata>;
  getStreamsByUser(userId: string, query?: StreamQuery): Promise<StreamDiscovery>;
  discoverStreams(query?: StreamQuery): Promise<StreamDiscovery>;
  searchStreams(searchTerm: string, query?: StreamQuery): Promise<StreamDiscovery>;

  /**
   * Stream Monitoring & Analytics
   */
  getStreamStats(streamId: string): Promise<StreamStats>;
  getStreamHealth(streamId: string): Promise<StreamStatus>;
  updateStreamHealth(streamId: string, health: StreamHealth): Promise<void>;

  /**
   * Stream Recording
   */
  startRecording(streamId: string, userId: string): Promise<void>;
  stopRecording(streamId: string, userId: string): Promise<StreamRecording>;
  getRecordings(streamId: string): Promise<StreamRecording[]>;
  getRecording(recordingId: string): Promise<StreamRecording>;
  deleteRecording(recordingId: string, userId: string): Promise<void>;

  /**
   * Viewer Management
   */
  addViewer(streamId: string, viewerId: string): Promise<void>;
  removeViewer(streamId: string, viewerId: string): Promise<void>;
  getViewers(streamId: string): Promise<string[]>;

  /**
   * Event System
   */
  emitStreamEvent(event: Omit<StreamEvent, 'id' | 'timestamp'>): Promise<void>;
  getStreamEvents(streamId: string, limit?: number): Promise<StreamEvent[]>;

  /**
   * Stream Statistics
   */
  getStreamStatistics(): Promise<{
    totalStreams: number;
    activeStreams: number;
    totalViews: number;
    totalRecordings: number;
    averageViewDuration: number;
    topStreams: Array<{
      streamId: string;
      title: string;
      viewers: number;
      views: number;
    }>;
  }>;
}
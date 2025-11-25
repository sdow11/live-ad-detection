import { Stream } from './ISmartPiPAutomationService';

// Dependency Inversion Principle: Abstract interface for stream control
export interface IStreamController {
  // Stream control operations
  pauseStream(streamId: string): Promise<void>;
  resumeStream(streamId: string): Promise<void>;
  stopStream(streamId: string): Promise<void>;
  restartStream(streamId: string): Promise<void>;

  // Quality management
  changeQuality(streamId: string, quality: QualitySettings): Promise<void>;

  // Stream information
  getStreamStatus(streamId: string): Promise<StreamStatus>;
  getStreamMetrics(streamId: string): Promise<StreamMetrics>;

  // Recording
  recordStream(streamId: string, options: RecordingOptions): Promise<void>;
}

export interface QualitySettings {
  resolution: string;
  bitrate: number;
  framerate: number;
  codec?: string;
}

export interface StreamStatus {
  id: string;
  state: 'live' | 'paused' | 'stopped' | 'error';
  health: 'excellent' | 'good' | 'fair' | 'poor';
  quality: QualitySettings;
  currentViewers: number;
  startTime: Date;
  duration: number;
}

export interface StreamMetrics {
  viewerCount: number;
  averageViewTime: number;
  peakViewers: number;
  qualityMetrics: QualityMetrics;
  networkMetrics: NetworkMetrics;
}

export interface QualityMetrics {
  averageBitrate: number;
  droppedFrames: number;
  bufferingEvents: number;
  qualitySwitches: number;
}

export interface NetworkMetrics {
  bandwidth: number;
  latency: number;
  packetLoss: number;
  jitter: number;
}

export interface RecordingOptions {
  quality: QualitySettings;
  duration?: number;
  format: string;
  outputPath: string;
}
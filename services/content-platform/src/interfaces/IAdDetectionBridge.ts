/**
 * Ad Detection Bridge Interface
 * 
 * Defines the contract for integrating AI-powered ad detection
 * with the Content Platform's PiP automation system
 */

export interface AdDetection {
  detection_id: string;
  stream_id: string;
  timestamp: string;
  confidence: number;
  ad_type: string;
  bounding_box?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  metadata?: Record<string, any>;
}

export interface StreamConfig {
  stream_id: string;
  device_path: string;
  source_type: 'hdmi' | 'hdmi0' | 'hdmi1' | 'usb' | 'csi' | 'rtsp' | 'file';
  resolution: [number, number];
  fps: number;
  passthrough: boolean;
}

export interface AdDetectionConfig {
  model_path: string;
  confidence_threshold: number;
  enable_channel_monitoring: boolean;
  channel_stability_threshold: number;
  detection_cooldown_ms: number;
  auto_start_pip: boolean;
  pip_trigger_types: string[];
  priority_content_tags: string[];
}

export interface AdDetectionStats {
  detector: {
    total_frames_processed: number;
    total_detections: number;
    detections_by_stream: Record<string, number>;
    processing_fps: number;
    inference_time_ms: number;
    model_swaps: number;
  };
  streams: Record<string, {
    fps: number;
    frames_processed: number;
    status: string;
  }>;
  model: {
    name: string;
    path: string;
    loaded: boolean;
    device_info: string;
  };
}

export interface AdDetectionStatus {
  running: boolean;
  detector_connected: boolean;
  recent_detections_count: number;
  active_streams: number;
  config: AdDetectionConfig;
}

export interface IAdDetectionBridge {
  /**
   * Initialize the ad detection bridge
   */
  initialize(): Promise<void>;

  /**
   * Start the ad detection system
   */
  start(): Promise<void>;

  /**
   * Stop the ad detection system
   */
  stop(): Promise<void>;

  /**
   * Add a video stream for ad detection
   * @param config Stream configuration
   */
  addVideoStream(config: StreamConfig): Promise<void>;

  /**
   * Remove a video stream from ad detection
   * @param streamId Stream identifier
   */
  removeVideoStream(streamId: string): Promise<void>;

  /**
   * Update ad detection configuration
   * @param config Partial configuration to update
   */
  updateConfig(config: Partial<AdDetectionConfig>): Promise<void>;

  /**
   * Get recent ad detections
   * @param limit Maximum number of detections to return
   * @returns Array of recent detections
   */
  getRecentDetections(limit?: number): AdDetection[];

  /**
   * Get ad detection statistics
   * @returns Current statistics or null if not available
   */
  getStats(): Promise<AdDetectionStats | null>;

  /**
   * Get current bridge status
   * @returns Current status information
   */
  getStatus(): AdDetectionStatus;

  /**
   * Cleanup resources
   */
  cleanup(): Promise<void>;

  // Event emitter interface
  on(event: 'ad_detected', listener: (detection: AdDetection) => void): this;
  on(event: 'pip_triggered', listener: (data: { detection: AdDetection; session: any }) => void): this;
  on(event: 'started', listener: () => void): this;
  on(event: 'stopped', listener: () => void): this;
  on(event: 'detector_crashed', listener: (code: number) => void): this;
  on(event: 'detector_error', listener: (error: any) => void): this;
  on(event: 'status_update', listener: (status: any) => void): this;
  
  emit(event: string | symbol, ...args: any[]): boolean;
  removeAllListeners(event?: string | symbol): this;
}
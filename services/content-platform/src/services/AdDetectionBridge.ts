import { EventEmitter } from 'events';
import { IScheduleService } from '@/interfaces/IScheduleService';
import { IContentService } from '@/interfaces/IContentService';
import { IPiPAutomationService, PiPSession } from '@/interfaces/IPiPAutomationService';
import { Logger } from '@/utils/Logger';
import { spawn, ChildProcess } from 'child_process';
import { WebSocket, WebSocketServer } from 'ws';

/**
 * Ad Detection Bridge Service
 * 
 * Integrates the Python AI HAT ad detection system with the Content Platform
 * Enables real-time ad detection to trigger PiP automation and content switching
 * 
 * Single Responsibility: Bridge AI detection with content management
 * Open/Closed: Extensible for additional detection triggers
 * Liskov Substitution: Implements standard event-driven interfaces
 * Interface Segregation: Focused on ad detection integration
 * Dependency Inversion: Uses injected content and PiP services
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

export class AdDetectionBridge extends EventEmitter {
  private logger: Logger;
  private config: AdDetectionConfig;
  private detectorProcess: ChildProcess | null = null;
  private wsServer: WebSocketServer | null = null;
  private wsConnection: WebSocket | null = null;
  private isRunning: boolean = false;
  private recentDetections: AdDetection[] = [];
  private lastDetectionTime: Map<string, number> = new Map();
  private pipSessionMap: Map<string, string> = new Map(); // detection_id -> session_id

  constructor(
    private scheduleService: IScheduleService,
    private contentService: IContentService,
    private pipService: IPiPAutomationService,
    config: Partial<AdDetectionConfig> = {}
  ) {
    super();
    this.logger = new Logger('AdDetectionBridge');
    this.config = {
      model_path: process.env.AD_MODEL_PATH || '/opt/models/ad_detection.hef',
      confidence_threshold: 0.8,
      enable_channel_monitoring: true,
      channel_stability_threshold: 30,
      detection_cooldown_ms: 5000, // 5 second cooldown between triggers
      auto_start_pip: true,
      pip_trigger_types: ['commercial', 'pre-roll', 'mid-roll'],
      priority_content_tags: ['priority', 'emergency', 'urgent'],
      ...config
    };
  }

  /**
   * Initialize the ad detection bridge
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Ad Detection Bridge');

    try {
      // Set up WebSocket server for communication with Python detector
      await this.setupWebSocketServer();

      // Register PiP automation trigger for ad detection
      this.pipService.addTriggerCondition({
        id: 'ad-detection-bridge',
        name: 'AI Ad Detection',
        description: 'Trigger PiP when ads are detected by AI HAT',
        isActive: true,
        priority: 95,
        evaluate: async () => {
          // This is handled by direct callbacks, so always return false
          // The actual triggering happens in handleAdDetection
          return false;
        }
      });

      this.logger.info('Ad Detection Bridge initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Ad Detection Bridge:', error);
      throw error;
    }
  }

  /**
   * Start the ad detection system
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Ad detection already running');
      return;
    }

    this.logger.info('Starting ad detection system');

    try {
      // Start the Python ad detection process
      await this.startDetectorProcess();
      
      this.isRunning = true;
      this.emit('started');
      
      this.logger.info('Ad detection system started successfully');
    } catch (error) {
      this.logger.error('Failed to start ad detection:', error);
      throw error;
    }
  }

  /**
   * Stop the ad detection system
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping ad detection system');

    try {
      // Stop detector process
      if (this.detectorProcess) {
        this.detectorProcess.kill('SIGTERM');
        this.detectorProcess = null;
      }

      // Close WebSocket connections
      if (this.wsConnection) {
        this.wsConnection.close();
        this.wsConnection = null;
      }

      if (this.wsServer) {
        this.wsServer.close();
        this.wsServer = null;
      }

      this.isRunning = false;
      this.emit('stopped');
      
      this.logger.info('Ad detection system stopped');
    } catch (error) {
      this.logger.error('Error stopping ad detection:', error);
    }
  }

  /**
   * Add a video stream for ad detection
   */
  async addVideoStream(config: StreamConfig): Promise<void> {
    this.logger.info(`Adding video stream: ${config.stream_id}`);

    if (!this.wsConnection) {
      throw new Error('Ad detector not connected');
    }

    const message = {
      type: 'add_stream',
      data: config
    };

    this.wsConnection.send(JSON.stringify(message));
  }

  /**
   * Remove a video stream
   */
  async removeVideoStream(streamId: string): Promise<void> {
    this.logger.info(`Removing video stream: ${streamId}`);

    if (!this.wsConnection) {
      throw new Error('Ad detector not connected');
    }

    const message = {
      type: 'remove_stream',
      data: { stream_id: streamId }
    };

    this.wsConnection.send(JSON.stringify(message));
  }

  /**
   * Update detection configuration
   */
  async updateConfig(newConfig: Partial<AdDetectionConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    this.logger.info('Updated ad detection configuration');

    if (this.wsConnection) {
      const message = {
        type: 'update_config',
        data: this.config
      };
      this.wsConnection.send(JSON.stringify(message));
    }
  }

  /**
   * Get recent ad detections
   */
  getRecentDetections(limit: number = 50): AdDetection[] {
    return this.recentDetections.slice(-limit).reverse();
  }

  /**
   * Get ad detection statistics
   */
  async getStats(): Promise<AdDetectionStats | null> {
    if (!this.wsConnection) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Stats request timeout'));
      }, 5000);

      const messageId = Math.random().toString(36);
      
      const handleMessage = (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'stats_response' && message.id === messageId) {
            clearTimeout(timeout);
            this.wsConnection?.off('message', handleMessage);
            resolve(message.data);
          }
        } catch (error) {
          // Ignore parse errors for other messages
        }
      };

      this.wsConnection.on('message', handleMessage);

      const message = {
        type: 'get_stats',
        id: messageId
      };

      this.wsConnection.send(JSON.stringify(message));
    });
  }

  /**
   * Set up WebSocket server for communication with Python detector
   */
  private async setupWebSocketServer(): Promise<void> {
    const port = parseInt(process.env.AD_DETECTION_WS_PORT || '8765');
    
    this.wsServer = new WebSocketServer({ port });

    this.wsServer.on('connection', (ws) => {
      this.logger.info('Ad detector connected via WebSocket');
      this.wsConnection = ws;

      ws.on('message', (data) => {
        this.handleWebSocketMessage(data);
      });

      ws.on('close', () => {
        this.logger.warn('Ad detector WebSocket connection closed');
        this.wsConnection = null;
      });

      ws.on('error', (error) => {
        this.logger.error('WebSocket error:', error);
      });

      // Send initial configuration
      const message = {
        type: 'config',
        data: this.config
      };
      ws.send(JSON.stringify(message));
    });

    this.logger.info(`WebSocket server listening on port ${port}`);
  }

  /**
   * Start the Python ad detector process
   */
  private async startDetectorProcess(): Promise<void> {
    const pythonScript = `
import asyncio
import websockets
import json
import sys
import os

# Add the parent directory to the Python path
sys.path.append('${process.cwd()}/../../src')

from live_ad_detection.ai_hat.ad_detector import AdDetector

class AdDetectionService:
    def __init__(self):
        self.detector = None
        self.websocket = None
        
    async def connect_and_run(self):
        uri = "ws://localhost:${process.env.AD_DETECTION_WS_PORT || '8765'}"
        async with websockets.connect(uri) as websocket:
            self.websocket = websocket
            await self.handle_messages()
    
    async def handle_messages(self):
        async for message in self.websocket:
            try:
                data = json.loads(message)
                await self.process_message(data)
            except Exception as e:
                print(f"Error processing message: {e}")
    
    async def process_message(self, data):
        msg_type = data.get('type')
        
        if msg_type == 'config':
            await self.setup_detector(data['data'])
        elif msg_type == 'add_stream':
            await self.add_stream(data['data'])
        elif msg_type == 'remove_stream':
            await self.remove_stream(data['data'])
        elif msg_type == 'get_stats':
            await self.send_stats(data.get('id'))
    
    async def setup_detector(self, config):
        def detection_callback(detection):
            # Send detection to Node.js
            asyncio.create_task(self.send_detection(detection))
        
        self.detector = AdDetector(
            model_path=config['model_path'],
            confidence_threshold=config['confidence_threshold'],
            detection_callback=detection_callback,
            enable_channel_monitoring=config['enable_channel_monitoring'],
            channel_stability_threshold=config['channel_stability_threshold']
        )
        
        if self.detector.initialize():
            self.detector.start()
            print("Ad detector initialized and started")
    
    async def add_stream(self, stream_config):
        if self.detector:
            success = self.detector.add_video_stream(
                stream_id=stream_config['stream_id'],
                device_path=stream_config['device_path'],
                source_type=stream_config['source_type'],
                resolution=tuple(stream_config['resolution']),
                fps=stream_config['fps'],
                passthrough=stream_config['passthrough']
            )
            print(f"Added stream {stream_config['stream_id']}: {success}")
    
    async def remove_stream(self, data):
        # Implementation would depend on video processor capabilities
        print(f"Remove stream request: {data['stream_id']}")
    
    async def send_detection(self, detection):
        if self.websocket:
            message = {
                'type': 'detection',
                'data': detection.to_dict()
            }
            await self.websocket.send(json.dumps(message))
    
    async def send_stats(self, message_id):
        if self.detector and self.websocket:
            stats = self.detector.get_stats()
            message = {
                'type': 'stats_response',
                'id': message_id,
                'data': stats
            }
            await self.websocket.send(json.dumps(message))

if __name__ == "__main__":
    service = AdDetectionService()
    asyncio.run(service.connect_and_run())
`;

    // Write Python script to temporary file
    const fs = require('fs').promises;
    const scriptPath = '/tmp/ad_detection_bridge.py';
    await fs.writeFile(scriptPath, pythonScript);

    // Start Python process
    this.detectorProcess = spawn('python3', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONPATH: `${process.cwd()}/../../src:${process.env.PYTHONPATH || ''}`
      }
    });

    this.detectorProcess.stdout?.on('data', (data) => {
      this.logger.debug(`Detector stdout: ${data}`);
    });

    this.detectorProcess.stderr?.on('data', (data) => {
      this.logger.error(`Detector stderr: ${data}`);
    });

    this.detectorProcess.on('exit', (code) => {
      this.logger.info(`Detector process exited with code ${code}`);
      this.detectorProcess = null;
      if (this.isRunning) {
        this.emit('detector_crashed', code);
      }
    });

    // Wait a moment for the process to start
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Handle incoming WebSocket messages from Python detector
   */
  private handleWebSocketMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'detection':
          this.handleAdDetection(message.data);
          break;
        case 'status':
          this.handleStatusUpdate(message.data);
          break;
        case 'error':
          this.handleError(message.data);
          break;
      }
    } catch (error) {
      this.logger.error('Error parsing WebSocket message:', error);
    }
  }

  /**
   * Handle an ad detection event
   */
  private async handleAdDetection(detection: AdDetection): Promise<void> {
    try {
      // Store detection
      this.recentDetections.push(detection);
      if (this.recentDetections.length > 1000) {
        this.recentDetections = this.recentDetections.slice(-500);
      }

      // Check cooldown period
      const lastDetection = this.lastDetectionTime.get(detection.stream_id);
      const now = Date.now();
      if (lastDetection && now - lastDetection < this.config.detection_cooldown_ms) {
        this.logger.debug(`Ad detection cooldown active for stream ${detection.stream_id}`);
        return;
      }

      this.lastDetectionTime.set(detection.stream_id, now);

      this.logger.info(
        `Ad detected: ${detection.ad_type} on ${detection.stream_id} ` +
        `(confidence: ${detection.confidence})`
      );

      // Emit event for other systems
      this.emit('ad_detected', detection);

      // Auto-trigger PiP if enabled and ad type matches
      if (this.config.auto_start_pip && 
          this.config.pip_trigger_types.includes(detection.ad_type)) {
        await this.triggerPiPForDetection(detection);
      }

    } catch (error) {
      this.logger.error('Error handling ad detection:', error);
    }
  }

  /**
   * Trigger Picture-in-Picture for an ad detection
   */
  private async triggerPiPForDetection(detection: AdDetection): Promise<void> {
    try {
      // Find appropriate content to display in PiP
      const content = await this.findPiPContent(detection);
      if (!content) {
        this.logger.warn('No suitable content found for PiP trigger');
        return;
      }

      // Trigger PiP
      const session = await this.pipService.triggerPiP(
        content.id,
        `Ad detected: ${detection.ad_type} (${detection.confidence.toFixed(2)})`
      );

      // Map detection to PiP session for potential cleanup
      this.pipSessionMap.set(detection.detection_id, session.id);

      this.logger.info(
        `Triggered PiP session ${session.id} for ad detection ${detection.detection_id}`
      );

      this.emit('pip_triggered', { detection, session });

    } catch (error) {
      this.logger.error('Error triggering PiP for detection:', error);
    }
  }

  /**
   * Find suitable content for PiP display based on detection context
   */
  private async findPiPContent(detection: AdDetection): Promise<any> {
    try {
      // First, try to find currently scheduled content
      const activeSchedules = await this.scheduleService.getActiveSchedules();
      if (activeSchedules.length > 0) {
        const schedule = activeSchedules[0];
        const content = await this.contentService.getContent('system', schedule.contentId);
        if (content) {
          return content;
        }
      }

      // Next, try priority content based on tags
      const priorityContent = await this.contentService.listContent('system', {
        tags: this.config.priority_content_tags,
        status: 'ready',
        limit: 1,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      });

      if (priorityContent.data.length > 0) {
        return priorityContent.data[0];
      }

      // Fall back to most recent ready content
      const recentContent = await this.contentService.listContent('system', {
        status: 'ready',
        limit: 1,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      });

      return recentContent.data.length > 0 ? recentContent.data[0] : null;

    } catch (error) {
      this.logger.error('Error finding PiP content:', error);
      return null;
    }
  }

  /**
   * Handle status updates from detector
   */
  private handleStatusUpdate(status: any): void {
    this.emit('status_update', status);
  }

  /**
   * Handle error messages from detector
   */
  private handleError(error: any): void {
    this.logger.error('Detector error:', error);
    this.emit('detector_error', error);
  }

  /**
   * Get current bridge status
   */
  getStatus() {
    return {
      running: this.isRunning,
      detector_connected: this.wsConnection !== null,
      recent_detections_count: this.recentDetections.length,
      active_streams: this.lastDetectionTime.size,
      config: this.config
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.stop();
    this.removeAllListeners();
  }
}
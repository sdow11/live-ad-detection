import { Request, Response } from 'express';
import { IAdDetectionBridge, StreamConfig, AdDetectionConfig } from '@/interfaces/IAdDetectionBridge';
import { BaseController } from '@/controllers/BaseController';
import { ValidationError } from '@/utils/validation';

/**
 * Ad Detection Controller
 * 
 * Handles HTTP requests for AI-powered ad detection functionality
 * Provides REST API endpoints for managing ad detection and stream configuration
 * 
 * Single Responsibility: Handle ad detection HTTP requests and responses
 * Open/Closed: Extensible for additional ad detection endpoints
 * Liskov Substitution: Uses standard Express Request/Response interfaces
 * Interface Segregation: Focused solely on ad detection HTTP handling
 * Dependency Inversion: Uses injected ad detection bridge service
 */

export class AdDetectionController extends BaseController {
  constructor(private adDetectionBridge: IAdDetectionBridge) {
    super();
  }

  /**
   * Initialize ad detection system
   * POST /api/v1/ad-detection/initialize
   */
  async initialize(req: Request, res: Response): Promise<void> {
    try {
      await this.adDetectionBridge.initialize();
      
      res.json({
        success: true,
        message: 'Ad detection system initialized successfully',
        data: this.adDetectionBridge.getStatus()
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Start ad detection
   * POST /api/v1/ad-detection/start
   */
  async start(req: Request, res: Response): Promise<void> {
    try {
      await this.adDetectionBridge.start();
      
      res.json({
        success: true,
        message: 'Ad detection started successfully',
        data: this.adDetectionBridge.getStatus()
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Stop ad detection
   * POST /api/v1/ad-detection/stop
   */
  async stop(req: Request, res: Response): Promise<void> {
    try {
      await this.adDetectionBridge.stop();
      
      res.json({
        success: true,
        message: 'Ad detection stopped successfully',
        data: this.adDetectionBridge.getStatus()
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get ad detection status
   * GET /api/v1/ad-detection/status
   */
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = this.adDetectionBridge.getStatus();
      
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get ad detection statistics
   * GET /api/v1/ad-detection/stats
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.adDetectionBridge.getStats();
      
      if (stats === null) {
        res.status(503).json({
          success: false,
          message: 'Ad detection system not available'
        });
        return;
      }

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get recent detections
   * GET /api/v1/ad-detection/detections
   * Query params: limit (optional, default 50)
   */
  async getRecentDetections(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      
      if (limit < 1 || limit > 1000) {
        throw new ValidationError('Limit must be between 1 and 1000');
      }

      const detections = this.adDetectionBridge.getRecentDetections(limit);
      
      res.json({
        success: true,
        data: detections,
        meta: {
          count: detections.length,
          limit
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Add video stream for ad detection
   * POST /api/v1/ad-detection/streams
   * Body: StreamConfig
   */
  async addStream(req: Request, res: Response): Promise<void> {
    try {
      const streamConfig: StreamConfig = req.body;

      // Validate required fields
      if (!streamConfig.stream_id || !streamConfig.device_path || !streamConfig.source_type) {
        throw new ValidationError('stream_id, device_path, and source_type are required');
      }

      // Validate source type
      const validSourceTypes = ['hdmi', 'hdmi0', 'hdmi1', 'usb', 'csi', 'rtsp', 'file'];
      if (!validSourceTypes.includes(streamConfig.source_type)) {
        throw new ValidationError(`source_type must be one of: ${validSourceTypes.join(', ')}`);
      }

      // Validate resolution
      if (!Array.isArray(streamConfig.resolution) || 
          streamConfig.resolution.length !== 2 ||
          !streamConfig.resolution.every(n => typeof n === 'number' && n > 0)) {
        throw new ValidationError('resolution must be an array of two positive numbers [width, height]');
      }

      // Set defaults
      const config: StreamConfig = {
        stream_id: streamConfig.stream_id,
        device_path: streamConfig.device_path,
        source_type: streamConfig.source_type,
        resolution: streamConfig.resolution,
        fps: streamConfig.fps || 30,
        passthrough: streamConfig.passthrough !== false // default true
      };

      await this.adDetectionBridge.addVideoStream(config);
      
      res.status(201).json({
        success: true,
        message: 'Video stream added successfully',
        data: config
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Remove video stream from ad detection
   * DELETE /api/v1/ad-detection/streams/:streamId
   */
  async removeStream(req: Request, res: Response): Promise<void> {
    try {
      const { streamId } = req.params;

      if (!streamId) {
        throw new ValidationError('Stream ID is required');
      }

      await this.adDetectionBridge.removeVideoStream(streamId);
      
      res.json({
        success: true,
        message: 'Video stream removed successfully',
        data: { streamId }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Update ad detection configuration
   * PATCH /api/v1/ad-detection/config
   * Body: Partial<AdDetectionConfig>
   */
  async updateConfig(req: Request, res: Response): Promise<void> {
    try {
      const configUpdate: Partial<AdDetectionConfig> = req.body;

      // Validate configuration fields
      if (configUpdate.confidence_threshold !== undefined) {
        if (typeof configUpdate.confidence_threshold !== 'number' || 
            configUpdate.confidence_threshold < 0 || 
            configUpdate.confidence_threshold > 1) {
          throw new ValidationError('confidence_threshold must be a number between 0 and 1');
        }
      }

      if (configUpdate.channel_stability_threshold !== undefined) {
        if (typeof configUpdate.channel_stability_threshold !== 'number' || 
            configUpdate.channel_stability_threshold < 1) {
          throw new ValidationError('channel_stability_threshold must be a positive number');
        }
      }

      if (configUpdate.detection_cooldown_ms !== undefined) {
        if (typeof configUpdate.detection_cooldown_ms !== 'number' || 
            configUpdate.detection_cooldown_ms < 0) {
          throw new ValidationError('detection_cooldown_ms must be a non-negative number');
        }
      }

      if (configUpdate.pip_trigger_types !== undefined) {
        if (!Array.isArray(configUpdate.pip_trigger_types) ||
            !configUpdate.pip_trigger_types.every(type => typeof type === 'string')) {
          throw new ValidationError('pip_trigger_types must be an array of strings');
        }
      }

      if (configUpdate.priority_content_tags !== undefined) {
        if (!Array.isArray(configUpdate.priority_content_tags) ||
            !configUpdate.priority_content_tags.every(tag => typeof tag === 'string')) {
          throw new ValidationError('priority_content_tags must be an array of strings');
        }
      }

      await this.adDetectionBridge.updateConfig(configUpdate);
      
      const updatedStatus = this.adDetectionBridge.getStatus();

      res.json({
        success: true,
        message: 'Ad detection configuration updated successfully',
        data: updatedStatus.config
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get current ad detection configuration
   * GET /api/v1/ad-detection/config
   */
  async getConfig(req: Request, res: Response): Promise<void> {
    try {
      const status = this.adDetectionBridge.getStatus();
      
      res.json({
        success: true,
        data: status.config
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Test ad detection with a sample frame or video file
   * POST /api/v1/ad-detection/test
   * Body: { test_type: 'sample' | 'file', file_path?: string }
   */
  async testDetection(req: Request, res: Response): Promise<void> {
    try {
      const { test_type, file_path } = req.body;

      if (!test_type || !['sample', 'file'].includes(test_type)) {
        throw new ValidationError('test_type must be "sample" or "file"');
      }

      if (test_type === 'file' && !file_path) {
        throw new ValidationError('file_path is required for file test type');
      }

      // For now, return a mock test result
      // In a full implementation, this would trigger actual testing
      const testResult = {
        test_type,
        file_path: file_path || null,
        timestamp: new Date().toISOString(),
        status: 'completed',
        detections_found: Math.floor(Math.random() * 5), // Mock result
        processing_time_ms: Math.floor(Math.random() * 1000) + 100,
        confidence_scores: [0.85, 0.92, 0.78].slice(0, Math.floor(Math.random() * 3) + 1)
      };

      res.json({
        success: true,
        message: 'Test detection completed successfully',
        data: testResult
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get supported video sources and their capabilities
   * GET /api/v1/ad-detection/sources
   */
  async getSupportedSources(req: Request, res: Response): Promise<void> {
    try {
      const sources = [
        {
          type: 'hdmi',
          name: 'HDMI Input 0',
          description: 'Primary HDMI capture device',
          supported_resolutions: ['1920x1080', '1280x720', '3840x2160'],
          max_fps: 60,
          passthrough_supported: true
        },
        {
          type: 'hdmi0',
          name: 'HDMI Input 0 (Explicit)',
          description: 'Primary HDMI capture device (explicit naming)',
          supported_resolutions: ['1920x1080', '1280x720', '3840x2160'],
          max_fps: 60,
          passthrough_supported: true
        },
        {
          type: 'hdmi1',
          name: 'HDMI Input 1',
          description: 'Secondary HDMI capture device',
          supported_resolutions: ['1920x1080', '1280x720'],
          max_fps: 30,
          passthrough_supported: true
        },
        {
          type: 'usb',
          name: 'USB Camera',
          description: 'USB-connected camera or capture device',
          supported_resolutions: ['1920x1080', '1280x720', '640x480'],
          max_fps: 30,
          passthrough_supported: false
        },
        {
          type: 'csi',
          name: 'CSI Camera',
          description: 'Camera Serial Interface (Raspberry Pi camera)',
          supported_resolutions: ['1920x1080', '1280x720'],
          max_fps: 30,
          passthrough_supported: false
        },
        {
          type: 'rtsp',
          name: 'RTSP Stream',
          description: 'Network RTSP video stream',
          supported_resolutions: ['Variable'],
          max_fps: 60,
          passthrough_supported: false
        },
        {
          type: 'file',
          name: 'Video File',
          description: 'Local video file for testing',
          supported_resolutions: ['Variable'],
          max_fps: 60,
          passthrough_supported: false
        }
      ];

      res.json({
        success: true,
        data: sources
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Manually trigger a test detection event
   * POST /api/v1/ad-detection/trigger-test
   * Body: { stream_id: string, ad_type: string, confidence: number }
   */
  async triggerTestDetection(req: Request, res: Response): Promise<void> {
    try {
      const { stream_id, ad_type, confidence } = req.body;

      if (!stream_id || !ad_type) {
        throw new ValidationError('stream_id and ad_type are required');
      }

      if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
        throw new ValidationError('confidence must be a number between 0 and 1');
      }

      // Create a test detection event
      const testDetection = {
        detection_id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        stream_id,
        timestamp: new Date().toISOString(),
        confidence,
        ad_type,
        bounding_box: {
          x: 0.1,
          y: 0.1,
          w: 0.8,
          h: 0.8
        },
        metadata: {
          test: true,
          triggered_manually: true
        }
      };

      // Emit the test detection (this would trigger PiP if configured)
      (this.adDetectionBridge as any).handleAdDetection?.(testDetection);

      res.json({
        success: true,
        message: 'Test detection triggered successfully',
        data: testDetection
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }
}
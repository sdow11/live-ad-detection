import { Request, Response } from 'express';
import { IPiPAutomationService, PiPTriggerCondition } from '@/interfaces/IPiPAutomationService';
import { BaseController } from '@/controllers/BaseController';
import { ValidationError } from '@/utils/validation';

/**
 * Picture-in-Picture Controller
 * 
 * Handles HTTP requests for PiP automation functionality
 * Provides REST API endpoints for managing PiP sessions and configuration
 * 
 * Single Responsibility: Handle PiP-related HTTP requests and responses
 * Open/Closed: Extensible for additional PiP endpoints
 * Liskov Substitution: Uses standard Express Request/Response interfaces
 * Interface Segregation: Focused solely on PiP HTTP handling
 * Dependency Inversion: Uses injected PiP automation service
 */

export class PiPController extends BaseController {
  constructor(private pipService: IPiPAutomationService) {
    super();
  }

  /**
   * Start PiP automation service
   * POST /api/v1/pip/start
   */
  async startAutomation(req: Request, res: Response): Promise<void> {
    try {
      await this.pipService.start();
      
      res.json({
        success: true,
        message: 'PiP automation started successfully',
        data: {
          status: 'running',
          activeSessions: this.pipService.getActiveSessions()
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Stop PiP automation service
   * POST /api/v1/pip/stop
   */
  async stopAutomation(req: Request, res: Response): Promise<void> {
    try {
      await this.pipService.stop();
      
      res.json({
        success: true,
        message: 'PiP automation stopped successfully',
        data: {
          status: 'stopped',
          activeSessions: []
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Manually trigger PiP for specific content
   * POST /api/v1/pip/trigger
   * Body: { contentId: string, reason?: string, scheduleId?: string }
   */
  async triggerPiP(req: Request, res: Response): Promise<void> {
    try {
      const { contentId, reason, scheduleId } = req.body;

      if (!contentId) {
        throw new ValidationError('Content ID is required');
      }

      const session = await this.pipService.triggerPiP(
        contentId,
        reason || 'Manual trigger',
        scheduleId
      );

      res.status(201).json({
        success: true,
        message: 'PiP session created successfully',
        data: session
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * End a specific PiP session
   * DELETE /api/v1/pip/sessions/:sessionId
   */
  async endSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        throw new ValidationError('Session ID is required');
      }

      await this.pipService.endPiPSession(sessionId);

      res.json({
        success: true,
        message: 'PiP session ended successfully',
        data: { sessionId }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Update PiP session position
   * PATCH /api/v1/pip/sessions/:sessionId/position
   * Body: { x: number, y: number, width: number, height: number }
   */
  async updateSessionPosition(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { x, y, width, height } = req.body;

      if (!sessionId) {
        throw new ValidationError('Session ID is required');
      }

      if (typeof x !== 'number' || typeof y !== 'number' || 
          typeof width !== 'number' || typeof height !== 'number') {
        throw new ValidationError('Position coordinates must be numbers');
      }

      await this.pipService.updatePiPPosition(sessionId, { x, y, width, height });

      res.json({
        success: true,
        message: 'PiP session position updated successfully',
        data: { sessionId, position: { x, y, width, height } }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get all active PiP sessions
   * GET /api/v1/pip/sessions
   */
  async getActiveSessions(req: Request, res: Response): Promise<void> {
    try {
      const sessions = this.pipService.getActiveSessions();

      res.json({
        success: true,
        data: sessions,
        meta: {
          total: sessions.length,
          active: sessions.filter(s => s.isActive).length
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get PiP configuration
   * GET /api/v1/pip/config
   */
  async getConfiguration(req: Request, res: Response): Promise<void> {
    try {
      const config = this.pipService.getConfiguration();

      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Update PiP configuration
   * PATCH /api/v1/pip/config
   * Body: Partial<PiPConfiguration>
   */
  async updateConfiguration(req: Request, res: Response): Promise<void> {
    try {
      const configUpdate = req.body;

      // Basic validation
      if (configUpdate.maxConcurrentSessions !== undefined && 
          (typeof configUpdate.maxConcurrentSessions !== 'number' || 
           configUpdate.maxConcurrentSessions < 1)) {
        throw new ValidationError('maxConcurrentSessions must be a positive number');
      }

      if (configUpdate.defaultPosition !== undefined) {
        const pos = configUpdate.defaultPosition;
        if (typeof pos.x !== 'number' || typeof pos.y !== 'number' ||
            typeof pos.width !== 'number' || typeof pos.height !== 'number') {
          throw new ValidationError('defaultPosition coordinates must be numbers');
        }
      }

      await this.pipService.updateConfiguration(configUpdate);

      const updatedConfig = this.pipService.getConfiguration();

      res.json({
        success: true,
        message: 'PiP configuration updated successfully',
        data: updatedConfig
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Add a custom trigger condition
   * POST /api/v1/pip/triggers
   * Body: { id: string, name: string, description: string, priority: number, isActive?: boolean }
   */
  async addTriggerCondition(req: Request, res: Response): Promise<void> {
    try {
      const { id, name, description, priority, isActive = true } = req.body;

      if (!id || !name || !description || typeof priority !== 'number') {
        throw new ValidationError('id, name, description, and priority are required');
      }

      // Create a basic trigger condition (evaluation logic would be implemented separately)
      const condition: PiPTriggerCondition = {
        id,
        name,
        description,
        priority,
        isActive,
        evaluate: async () => {
          // Placeholder implementation - would be customized per condition
          return false;
        }
      };

      this.pipService.addTriggerCondition(condition);

      res.status(201).json({
        success: true,
        message: 'Trigger condition added successfully',
        data: {
          id: condition.id,
          name: condition.name,
          description: condition.description,
          priority: condition.priority,
          isActive: condition.isActive
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Remove a trigger condition
   * DELETE /api/v1/pip/triggers/:conditionId
   */
  async removeTriggerCondition(req: Request, res: Response): Promise<void> {
    try {
      const { conditionId } = req.params;

      if (!conditionId) {
        throw new ValidationError('Condition ID is required');
      }

      this.pipService.removeTriggerCondition(conditionId);

      res.json({
        success: true,
        message: 'Trigger condition removed successfully',
        data: { conditionId }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get PiP automation status and statistics
   * GET /api/v1/pip/status
   */
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const config = this.pipService.getConfiguration();
      const activeSessions = this.pipService.getActiveSessions();

      const status = {
        enabled: config.enabled,
        running: activeSessions.length > 0,
        activeSessions: activeSessions.length,
        maxSessions: config.maxConcurrentSessions,
        autoTriggers: {
          onAds: config.autoTriggerOnAds,
          onSchedules: config.autoTriggerOnSchedules
        },
        sessions: activeSessions.map(session => ({
          id: session.id,
          contentId: session.contentId,
          triggerReason: session.triggerReason,
          startedAt: session.startedAt,
          isActive: session.isActive
        }))
      };

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }
}
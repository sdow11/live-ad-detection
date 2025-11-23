import { Request, Response } from 'express';
import { IScheduleService, ScheduleCreateDto, ScheduleUpdateDto } from '../interfaces/IScheduleService';
import { BaseController } from './BaseController';
import { ValidationError } from '../middleware/validation';

/**
 * Schedule Controller
 * 
 * Single Responsibility: Handle HTTP requests for schedule operations
 * Open/Closed: Extensible for additional endpoints
 * Liskov Substitution: Extends BaseController consistently
 * Interface Segregation: Focused on schedule HTTP operations
 * Dependency Inversion: Depends on IScheduleService abstraction
 */
export class ScheduleController extends BaseController {
  constructor(private scheduleService: IScheduleService) {
    super();
  }

  /**
   * Create a new schedule
   * POST /api/schedules
   */
  async createSchedule(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const scheduleData = this.validateScheduleCreateData(req.body);

      const schedule = await this.scheduleService.createSchedule(userId, scheduleData);
      
      res.status(201).json({
        success: true,
        data: schedule,
        message: 'Schedule created successfully'
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get schedule by ID
   * GET /api/schedules/:id
   */
  async getSchedule(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Schedule ID is required'
        });
        return;
      }

      const schedule = await this.scheduleService.getSchedule(id, userId);
      
      if (!schedule) {
        res.status(404).json({
          success: false,
          message: 'Schedule not found'
        });
        return;
      }

      res.json({
        success: true,
        data: schedule
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get all schedules for user with filtering
   * GET /api/schedules
   */
  async getSchedules(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const filter = this.parseScheduleFilter(req.query);

      const schedules = await this.scheduleService.getSchedules(userId, filter);
      
      res.json({
        success: true,
        data: schedules,
        meta: {
          count: schedules.length,
          filter
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Update schedule by ID
   * PUT /api/schedules/:id
   */
  async updateSchedule(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { id } = req.params;
      const updateData = this.validateScheduleUpdateData(req.body);

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Schedule ID is required'
        });
        return;
      }

      const schedule = await this.scheduleService.updateSchedule(id, userId, updateData);
      
      if (!schedule) {
        res.status(404).json({
          success: false,
          message: 'Schedule not found'
        });
        return;
      }

      res.json({
        success: true,
        data: schedule,
        message: 'Schedule updated successfully'
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Delete schedule by ID
   * DELETE /api/schedules/:id
   */
  async deleteSchedule(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Schedule ID is required'
        });
        return;
      }

      const deleted = await this.scheduleService.deleteSchedule(id, userId);
      
      if (!deleted) {
        res.status(404).json({
          success: false,
          message: 'Schedule not found'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Schedule deleted successfully'
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Toggle schedule active status
   * PATCH /api/schedules/:id/toggle
   */
  async toggleSchedule(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { id } = req.params;
      const { isActive } = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Schedule ID is required'
        });
        return;
      }

      if (typeof isActive !== 'boolean') {
        res.status(400).json({
          success: false,
          message: 'isActive must be a boolean'
        });
        return;
      }

      const success = await this.scheduleService.toggleSchedule(id, userId, isActive);
      
      if (!success) {
        res.status(404).json({
          success: false,
          message: 'Schedule not found'
        });
        return;
      }

      res.json({
        success: true,
        message: `Schedule ${isActive ? 'activated' : 'deactivated'} successfully`
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get upcoming schedule executions
   * GET /api/schedules/upcoming
   */
  async getUpcomingExecutions(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const limit = parseInt(req.query.limit as string) || 10;

      if (limit < 1 || limit > 100) {
        res.status(400).json({
          success: false,
          message: 'Limit must be between 1 and 100'
        });
        return;
      }

      const executions = await this.scheduleService.getUpcomingExecutions(userId, limit);
      
      res.json({
        success: true,
        data: executions,
        meta: {
          count: executions.length,
          limit
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get schedule execution history
   * GET /api/schedules/:id/history
   */
  async getExecutionHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Schedule ID is required'
        });
        return;
      }

      if (limit < 1 || limit > 500) {
        res.status(400).json({
          success: false,
          message: 'Limit must be between 1 and 500'
        });
        return;
      }

      const history = await this.scheduleService.getExecutionHistory(id, userId, limit);
      
      res.json({
        success: true,
        data: history,
        meta: {
          count: history.length,
          limit
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Validate cron expression
   * POST /api/schedules/validate-cron
   */
  async validateCronExpression(req: Request, res: Response): Promise<void> {
    try {
      const { expression } = req.body;

      if (!expression || typeof expression !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Cron expression is required'
        });
        return;
      }

      const validation = await this.scheduleService.validateCronExpression(expression);
      
      res.json({
        success: true,
        data: validation
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Preview schedule executions
   * POST /api/schedules/preview
   */
  async previewScheduleExecutions(req: Request, res: Response): Promise<void> {
    try {
      const { cronExpression, timezone, count = 5 } = req.body;

      if (!cronExpression || typeof cronExpression !== 'string') {
        res.status(400).json({
          success: false,
          message: 'cronExpression is required'
        });
        return;
      }

      if (!timezone || typeof timezone !== 'string') {
        res.status(400).json({
          success: false,
          message: 'timezone is required'
        });
        return;
      }

      if (count < 1 || count > 100) {
        res.status(400).json({
          success: false,
          message: 'count must be between 1 and 100'
        });
        return;
      }

      const executions = await this.scheduleService.previewScheduleExecutions(
        cronExpression,
        timezone,
        count
      );
      
      res.json({
        success: true,
        data: executions,
        meta: {
          count: executions.length
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Validate schedule creation data
   */
  private validateScheduleCreateData(data: any): ScheduleCreateDto {
    const errors: string[] = [];

    if (!data.contentId || typeof data.contentId !== 'string') {
      errors.push('contentId is required and must be a string');
    }

    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      errors.push('name is required and cannot be empty');
    }

    if (!data.cronExpression || typeof data.cronExpression !== 'string') {
      errors.push('cronExpression is required and must be a string');
    }

    if (!data.timezone || typeof data.timezone !== 'string') {
      errors.push('timezone is required and must be a string');
    }

    if (!data.startDate) {
      errors.push('startDate is required');
    } else {
      const startDate = new Date(data.startDate);
      if (isNaN(startDate.getTime())) {
        errors.push('startDate must be a valid date');
      }
    }

    if (data.endDate) {
      const endDate = new Date(data.endDate);
      if (isNaN(endDate.getTime())) {
        errors.push('endDate must be a valid date');
      }
    }

    if (errors.length > 0) {
      throw new ValidationError('Validation failed', errors);
    }

    return {
      contentId: data.contentId,
      name: data.name.trim(),
      description: data.description?.trim(),
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      cronExpression: data.cronExpression.trim(),
      timezone: data.timezone.trim(),
      isActive: data.isActive ?? true,
      metadata: data.metadata || {}
    };
  }

  /**
   * Validate schedule update data
   */
  private validateScheduleUpdateData(data: any): ScheduleUpdateDto {
    const updateData: ScheduleUpdateDto = {};

    if (data.name !== undefined) {
      if (typeof data.name !== 'string' || data.name.trim().length === 0) {
        throw new ValidationError('name must be a non-empty string', ['name']);
      }
      updateData.name = data.name.trim();
    }

    if (data.description !== undefined) {
      if (typeof data.description === 'string') {
        updateData.description = data.description.trim();
      }
    }

    if (data.startDate !== undefined) {
      const startDate = new Date(data.startDate);
      if (isNaN(startDate.getTime())) {
        throw new ValidationError('startDate must be a valid date', ['startDate']);
      }
      updateData.startDate = startDate;
    }

    if (data.endDate !== undefined) {
      if (data.endDate === null) {
        updateData.endDate = undefined;
      } else {
        const endDate = new Date(data.endDate);
        if (isNaN(endDate.getTime())) {
          throw new ValidationError('endDate must be a valid date', ['endDate']);
        }
        updateData.endDate = endDate;
      }
    }

    if (data.cronExpression !== undefined) {
      if (typeof data.cronExpression !== 'string') {
        throw new ValidationError('cronExpression must be a string', ['cronExpression']);
      }
      updateData.cronExpression = data.cronExpression.trim();
    }

    if (data.timezone !== undefined) {
      if (typeof data.timezone !== 'string') {
        throw new ValidationError('timezone must be a string', ['timezone']);
      }
      updateData.timezone = data.timezone.trim();
    }

    if (data.isActive !== undefined) {
      if (typeof data.isActive !== 'boolean') {
        throw new ValidationError('isActive must be a boolean', ['isActive']);
      }
      updateData.isActive = data.isActive;
    }

    if (data.metadata !== undefined) {
      if (typeof data.metadata !== 'object' || Array.isArray(data.metadata)) {
        throw new ValidationError('metadata must be an object', ['metadata']);
      }
      updateData.metadata = data.metadata;
    }

    return updateData;
  }

  /**
   * Parse schedule filter from query parameters
   */
  private parseScheduleFilter(query: any): any {
    const filter: any = {};

    if (query.contentId) filter.contentId = query.contentId;
    if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
    if (query.timezone) filter.timezone = query.timezone;
    if (query.search) filter.search = query.search;

    if (query.startDate) {
      const startDate = new Date(query.startDate);
      if (!isNaN(startDate.getTime())) {
        filter.startDate = startDate;
      }
    }

    if (query.endDate) {
      const endDate = new Date(query.endDate);
      if (!isNaN(endDate.getTime())) {
        filter.endDate = endDate;
      }
    }

    if (query.limit) {
      const limit = parseInt(query.limit);
      if (!isNaN(limit) && limit > 0 && limit <= 100) {
        filter.limit = limit;
      }
    }

    if (query.offset) {
      const offset = parseInt(query.offset);
      if (!isNaN(offset) && offset >= 0) {
        filter.offset = offset;
      }
    }

    if (query.sortBy && ['name', 'startDate', 'endDate', 'createdAt', 'nextExecutionAt'].includes(query.sortBy)) {
      filter.sortBy = query.sortBy;
    }

    if (query.sortOrder && ['asc', 'desc'].includes(query.sortOrder)) {
      filter.sortOrder = query.sortOrder;
    }

    return filter;
  }
}
import * as cron from 'node-cron';
import moment from 'moment-timezone';
import { IScheduleService, Schedule, ScheduleCreateDto, ScheduleUpdateDto, ScheduleFilter, ScheduleExecutionResult, UpcomingExecution, CronValidationResult } from '../interfaces/IScheduleService';
import { IScheduleRepository } from '../interfaces/IScheduleRepository';
import { IContentRepository } from '../interfaces/IContentRepository';

/**
 * Schedule Service Implementation
 * 
 * Single Responsibility: Business logic for schedule management
 * Open/Closed: Extensible for additional scheduling features
 * Liskov Substitution: Implements IScheduleService interface
 * Interface Segregation: Focused on scheduling operations
 * Dependency Inversion: Depends on repository abstractions
 */
export class ScheduleService implements IScheduleService {
  constructor(
    private scheduleRepository: IScheduleRepository,
    private contentRepository: IContentRepository
  ) {}

  async createSchedule(userId: string, scheduleData: ScheduleCreateDto): Promise<Schedule> {
    // Validate content exists and belongs to user
    const content = await this.contentRepository.findById(scheduleData.contentId);
    if (!content) {
      throw new Error('Content not found');
    }

    if (content.userId !== userId) {
      throw new Error('Content does not belong to user');
    }

    // Validate cron expression
    const cronValidation = await this.validateCronExpression(scheduleData.cronExpression);
    if (!cronValidation.isValid) {
      throw new Error(`Invalid cron expression: ${cronValidation.errors.join(', ')}`);
    }

    // Validate timezone
    if (!moment.tz.zone(scheduleData.timezone)) {
      throw new Error(`Invalid timezone: ${scheduleData.timezone}`);
    }

    // Calculate next execution time
    const nextExecutionAt = this.calculateNextExecution(
      scheduleData.cronExpression,
      scheduleData.timezone,
      scheduleData.startDate
    );

    const schedule = await this.scheduleRepository.create({
      ...scheduleData,
      userId
    });

    // Update next execution time
    if (nextExecutionAt && schedule.isActive) {
      await this.scheduleRepository.updateExecutionStats(
        schedule.id,
        true, // success (for initial creation)
        new Date(),
        nextExecutionAt
      );
    }

    return schedule;
  }

  async getSchedule(scheduleId: string, userId: string): Promise<Schedule | null> {
    const schedule = await this.scheduleRepository.findById(scheduleId);
    
    if (!schedule || schedule.userId !== userId) {
      return null;
    }

    return schedule;
  }

  async getSchedules(userId: string, filter?: ScheduleFilter): Promise<Schedule[]> {
    return this.scheduleRepository.findAll({ ...filter, userId });
  }

  async updateSchedule(
    scheduleId: string, 
    userId: string, 
    updateData: ScheduleUpdateDto
  ): Promise<Schedule | null> {
    // Verify ownership
    const exists = await this.scheduleRepository.existsForUser(scheduleId, userId);
    if (!exists) {
      return null;
    }

    // Validate cron expression if provided
    if (updateData.cronExpression) {
      const cronValidation = await this.validateCronExpression(updateData.cronExpression);
      if (!cronValidation.isValid) {
        throw new Error(`Invalid cron expression: ${cronValidation.errors.join(', ')}`);
      }
    }

    // Validate timezone if provided
    if (updateData.timezone && !moment.tz.zone(updateData.timezone)) {
      throw new Error(`Invalid timezone: ${updateData.timezone}`);
    }

    const schedule = await this.scheduleRepository.update(scheduleId, updateData);
    
    // Recalculate next execution if cron expression, timezone, or dates changed
    if (schedule && (updateData.cronExpression || updateData.timezone || updateData.startDate)) {
      const nextExecutionAt = this.calculateNextExecution(
        schedule.cronExpression,
        schedule.timezone,
        schedule.startDate
      );

      if (nextExecutionAt && schedule.isActive) {
        await this.scheduleRepository.updateExecutionStats(
          schedule.id,
          true,
          new Date(),
          nextExecutionAt
        );
      }
    }

    return schedule;
  }

  async deleteSchedule(scheduleId: string, userId: string): Promise<boolean> {
    const exists = await this.scheduleRepository.existsForUser(scheduleId, userId);
    if (!exists) {
      return false;
    }

    return this.scheduleRepository.delete(scheduleId);
  }

  async toggleSchedule(scheduleId: string, userId: string, isActive: boolean): Promise<boolean> {
    const schedule = await this.getSchedule(scheduleId, userId);
    if (!schedule) {
      return false;
    }

    let nextExecutionAt: Date | undefined;
    if (isActive) {
      nextExecutionAt = this.calculateNextExecution(
        schedule.cronExpression,
        schedule.timezone,
        schedule.startDate
      );
    }

    const updated = await this.scheduleRepository.update(scheduleId, { isActive });
    
    if (updated && nextExecutionAt) {
      await this.scheduleRepository.updateExecutionStats(
        scheduleId,
        true,
        new Date(),
        nextExecutionAt
      );
    }

    return updated !== null;
  }

  async getUpcomingExecutions(userId: string, limit = 10): Promise<UpcomingExecution[]> {
    const schedules = await this.scheduleRepository.findAll({
      userId,
      isActive: true,
      sortBy: 'nextExecutionAt',
      sortOrder: 'asc',
      limit
    });

    const upcomingExecutions: UpcomingExecution[] = [];

    for (const schedule of schedules) {
      if (schedule.nextExecutionAt) {
        const content = await this.contentRepository.findById(schedule.contentId);
        upcomingExecutions.push({
          scheduleId: schedule.id,
          scheduleName: schedule.name,
          contentId: schedule.contentId,
          contentTitle: content?.title || 'Unknown Content',
          executionTime: schedule.nextExecutionAt,
          timezone: schedule.timezone
        });
      }
    }

    return upcomingExecutions.slice(0, limit);
  }

  async getExecutionHistory(
    scheduleId: string, 
    userId: string, 
    limit = 50
  ): Promise<ScheduleExecutionResult[]> {
    const schedule = await this.getSchedule(scheduleId, userId);
    if (!schedule) {
      throw new Error('Schedule not found or access denied');
    }

    return this.scheduleRepository.getExecutionHistory(scheduleId, limit);
  }

  async validateCronExpression(expression: string): Promise<CronValidationResult> {
    const errors: string[] = [];
    let isValid = false;
    let nextExecutions: Date[] = [];

    try {
      // Validate with node-cron
      isValid = cron.validate(expression);
      
      if (!isValid) {
        errors.push('Invalid cron expression format');
      } else {
        // Generate next few executions for preview
        nextExecutions = this.generateNextExecutions(expression, 'UTC', 5);
      }
    } catch (error) {
      errors.push(`Cron validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      isValid = false;
    }

    return {
      isValid,
      errors,
      nextExecutions: isValid ? nextExecutions : undefined
    };
  }

  async previewScheduleExecutions(
    cronExpression: string, 
    timezone: string, 
    count: number
  ): Promise<Date[]> {
    // Validate inputs
    const cronValidation = await this.validateCronExpression(cronExpression);
    if (!cronValidation.isValid) {
      throw new Error(`Invalid cron expression: ${cronValidation.errors.join(', ')}`);
    }

    if (!moment.tz.zone(timezone)) {
      throw new Error(`Invalid timezone: ${timezone}`);
    }

    return this.generateNextExecutions(cronExpression, timezone, Math.min(count, 100));
  }

  /**
   * Calculate next execution time for a schedule
   */
  private calculateNextExecution(
    cronExpression: string, 
    timezone: string, 
    startDate: Date
  ): Date | undefined {
    try {
      const now = moment().tz(timezone);
      const start = moment(startDate).tz(timezone);
      
      // Use the later of now or start date
      const fromTime = moment.max(now, start);
      
      // Generate next execution
      const nextExecutions = this.generateNextExecutions(cronExpression, timezone, 1, fromTime.toDate());
      return nextExecutions[0];
    } catch (error) {
      console.error('Error calculating next execution:', error);
      return undefined;
    }
  }

  /**
   * Generate multiple next execution times
   */
  private generateNextExecutions(
    cronExpression: string, 
    timezone: string, 
    count: number, 
    fromDate?: Date
  ): Date[] {
    const executions: Date[] = [];
    const startTime = fromDate ? moment(fromDate).tz(timezone) : moment().tz(timezone);
    
    // Parse cron expression into schedule
    const schedule = this.parseCronExpression(cronExpression);
    
    let current = startTime.clone().add(1, 'minute').startOf('minute');
    
    while (executions.length < count && executions.length < 1000) {
      if (this.matchesCronSchedule(current, schedule)) {
        executions.push(current.toDate());
      }
      current.add(1, 'minute');
      
      // Safety break to prevent infinite loops
      if (current.isAfter(startTime.clone().add(2, 'years'))) {
        break;
      }
    }
    
    return executions;
  }

  /**
   * Parse cron expression into schedule object
   */
  private parseCronExpression(expression: string): CronSchedule {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new Error('Cron expression must have 5 parts: minute hour day month weekday');
    }

    return {
      minute: this.parseField(parts[0], 0, 59),
      hour: this.parseField(parts[1], 0, 23),
      day: this.parseField(parts[2], 1, 31),
      month: this.parseField(parts[3], 1, 12),
      weekday: this.parseField(parts[4], 0, 7) // 0 and 7 both represent Sunday
    };
  }

  /**
   * Parse individual cron field
   */
  private parseField(field: string, min: number, max: number): number[] {
    if (field === '*') {
      return Array.from({ length: max - min + 1 }, (_, i) => i + min);
    }

    const values: number[] = [];
    const ranges = field.split(',');

    for (const range of ranges) {
      if (range.includes('/')) {
        const [rangeOrStar, step] = range.split('/');
        const stepValue = parseInt(step, 10);
        const rangeValues = rangeOrStar === '*' 
          ? Array.from({ length: max - min + 1 }, (_, i) => i + min)
          : this.parseField(rangeOrStar, min, max);
        
        for (let i = 0; i < rangeValues.length; i += stepValue) {
          values.push(rangeValues[i]);
        }
      } else if (range.includes('-')) {
        const [start, end] = range.split('-').map(n => parseInt(n, 10));
        for (let i = start; i <= end; i++) {
          values.push(i);
        }
      } else {
        values.push(parseInt(range, 10));
      }
    }

    return values.filter(v => v >= min && v <= max);
  }

  /**
   * Check if moment matches cron schedule
   */
  private matchesCronSchedule(time: moment.Moment, schedule: CronSchedule): boolean {
    const minute = time.minute();
    const hour = time.hour();
    const day = time.date();
    const month = time.month() + 1; // moment months are 0-indexed
    const weekday = time.day(); // 0 = Sunday

    return (
      schedule.minute.includes(minute) &&
      schedule.hour.includes(hour) &&
      schedule.day.includes(day) &&
      schedule.month.includes(month) &&
      (schedule.weekday.includes(weekday) || schedule.weekday.includes(weekday === 0 ? 7 : weekday))
    );
  }
}

interface CronSchedule {
  minute: number[];
  hour: number[];
  day: number[];
  month: number[];
  weekday: number[];
}
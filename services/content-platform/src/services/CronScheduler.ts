import * as cron from 'node-cron';
import moment from 'moment-timezone';
import { IScheduleRepository } from '../interfaces/IScheduleRepository';
import { IContentRepository } from '../interfaces/IContentRepository';
import { ScheduleExecutionResult } from '../interfaces/IScheduleService';
import { Schedule } from '../models/Schedule';
import { Logger } from '../utils/Logger';

/**
 * Cron-based Schedule Executor
 * 
 * Single Responsibility: Execute scheduled content based on cron expressions
 * Open/Closed: Extensible for different execution strategies
 * Liskov Substitution: Consistent interface for scheduling
 * Interface Segregation: Focused on execution only
 * Dependency Inversion: Depends on repository abstractions
 */
export class CronScheduler {
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private isRunning = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private readonly POLLING_INTERVAL_MS = 60000; // 1 minute
  private readonly MAX_EXECUTION_TIME_MS = 300000; // 5 minutes
  private readonly logger = new Logger('CronScheduler');

  constructor(
    private scheduleRepository: IScheduleRepository,
    private contentRepository: IContentRepository
  ) {}

  /**
   * Start the cron scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Scheduler is already running');
      return;
    }

    this.logger.info('Starting cron scheduler');
    this.isRunning = true;

    // Start polling for active schedules
    await this.pollActiveSchedules();
    this.pollingInterval = setInterval(() => {
      this.pollActiveSchedules().catch(error => {
        this.logger.error('Error polling active schedules:', error);
      });
    }, this.POLLING_INTERVAL_MS);

    this.logger.info('Cron scheduler started successfully');
  }

  /**
   * Stop the cron scheduler
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Scheduler is not running');
      return;
    }

    this.logger.info('Stopping cron scheduler');
    this.isRunning = false;

    // Clear polling interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    // Stop all active cron tasks
    for (const [scheduleId, task] of this.tasks) {
      task.stop();
      this.logger.debug(`Stopped cron task for schedule ${scheduleId}`);
    }
    this.tasks.clear();

    this.logger.info('Cron scheduler stopped successfully');
  }

  /**
   * Get scheduler status
   */
  getStatus(): SchedulerStatus {
    return {
      isRunning: this.isRunning,
      activeTaskCount: this.tasks.size,
      activeTasks: Array.from(this.tasks.keys())
    };
  }

  /**
   * Poll for active schedules and update cron tasks
   */
  private async pollActiveSchedules(): Promise<void> {
    try {
      const activeSchedules = await this.scheduleRepository.findActiveSchedules();
      const currentTaskIds = new Set(this.tasks.keys());
      const activeScheduleIds = new Set(activeSchedules.map(s => s.id));

      // Remove tasks for schedules that are no longer active
      for (const scheduleId of currentTaskIds) {
        if (!activeScheduleIds.has(scheduleId)) {
          this.removeCronTask(scheduleId);
        }
      }

      // Add or update tasks for active schedules
      for (const schedule of activeSchedules) {
        await this.updateCronTask(schedule);
      }

      this.logger.debug(`Updated ${activeSchedules.length} active schedules`);
    } catch (error) {
      this.logger.error('Error polling active schedules:', error);
    }
  }

  /**
   * Update cron task for a schedule
   */
  private async updateCronTask(schedule: any): Promise<void> {
    try {
      // Remove existing task if it exists
      this.removeCronTask(schedule.id);

      // Validate cron expression
      if (!cron.validate(schedule.cronExpression)) {
        this.logger.error(`Invalid cron expression for schedule ${schedule.id}: ${schedule.cronExpression}`);
        return;
      }

      // Create new cron task
      const task = cron.schedule(
        schedule.cronExpression,
        async () => {
          await this.executeSchedule(schedule.id);
        },
        {
          timezone: schedule.timezone
        }
      );

      // Start the task
      task.start();
      this.tasks.set(schedule.id, task);

      this.logger.debug(`Created cron task for schedule ${schedule.id} with expression: ${schedule.cronExpression}`);
    } catch (error) {
      this.logger.error(`Error updating cron task for schedule ${schedule.id}:`, error);
    }
  }

  /**
   * Remove cron task for a schedule
   */
  private removeCronTask(scheduleId: string): void {
    const task = this.tasks.get(scheduleId);
    if (task) {
      task.stop();
      this.tasks.delete(scheduleId);
      this.logger.debug(`Removed cron task for schedule ${scheduleId}`);
    }
  }

  /**
   * Execute a specific schedule
   */
  private async executeSchedule(scheduleId: string): Promise<void> {
    const executionStart = Date.now();
    const executedAt = new Date();
    let success = false;
    let error: string | undefined;
    let duration: number | undefined;

    try {
      this.logger.info(`Executing schedule ${scheduleId}`);

      // Get fresh schedule data
      const schedule = await this.scheduleRepository.findById(scheduleId);
      if (!schedule) {
        throw new Error(`Schedule ${scheduleId} not found`);
      }

      // Check if schedule should still be executed
      const scheduleModel = new Schedule(schedule);
      if (!scheduleModel.shouldExecuteNow()) {
        this.logger.warn(`Schedule ${scheduleId} should not be executed now, skipping`);
        return;
      }

      // Get content to be executed
      const content = await this.contentRepository.findById(schedule.contentId);
      if (!content) {
        throw new Error(`Content ${schedule.contentId} not found for schedule ${scheduleId}`);
      }

      // Execute the content (this would trigger the actual playback/display)
      await this.executeContent(scheduleModel, content);

      // Calculate next execution time
      const nextExecutionAt = this.calculateNextExecution(scheduleModel);

      // Update execution statistics
      success = true;
      duration = Date.now() - executionStart;
      
      await this.scheduleRepository.updateExecutionStats(
        scheduleId,
        success,
        executedAt,
        nextExecutionAt
      );

      this.logger.info(`Successfully executed schedule ${scheduleId} in ${duration}ms`);
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : 'Unknown execution error';
      duration = Date.now() - executionStart;

      this.logger.error(`Failed to execute schedule ${scheduleId}:`, err);

      // Update failure statistics
      await this.scheduleRepository.updateExecutionStats(
        scheduleId,
        success,
        executedAt
      );

      // If too many consecutive failures, disable the schedule
      const schedule = await this.scheduleRepository.findById(scheduleId);
      if (schedule && schedule.failureCount >= 5) {
        this.logger.warn(`Disabling schedule ${scheduleId} due to excessive failures`);
        await this.scheduleRepository.update(scheduleId, { isActive: false });
        this.removeCronTask(scheduleId);
      }
    } finally {
      // Log execution result
      const executionResult: ScheduleExecutionResult = {
        scheduleId,
        contentId: '', // Will be set by executeContent if successful
        executedAt,
        success,
        error,
        duration,
        metadata: {
          executorVersion: '1.0.0',
          hostname: process.env.HOSTNAME || 'unknown'
        }
      };

      try {
        // Get content ID for logging
        const schedule = await this.scheduleRepository.findById(scheduleId);
        if (schedule) {
          executionResult.contentId = schedule.contentId;
        }

        await this.scheduleRepository.createExecutionLog(executionResult);
      } catch (logError) {
        this.logger.error(`Failed to log execution result for schedule ${scheduleId}:`, logError);
      }
    }
  }

  /**
   * Execute content (placeholder for actual content execution logic)
   */
  private async executeContent(schedule: any, content: any): Promise<void> {
    // This is where the actual content execution would happen
    // For now, this is a placeholder that simulates execution
    
    this.logger.info(`Executing content ${content.id} for schedule ${schedule.id}`);
    
    // Simulate execution time
    await new Promise(resolve => setTimeout(resolve, 100));

    // Here you would implement the actual content execution logic:
    // - Display content on screens
    // - Trigger audio playback
    // - Send commands to media players
    // - Update display systems
    // - etc.

    this.logger.debug(`Content execution completed for schedule ${schedule.id}`);
  }

  /**
   * Calculate next execution time for a schedule
   */
  private calculateNextExecution(schedule: any): Date | undefined {
    try {
      const now = moment().tz(schedule.timezone);
      const startTime = moment(schedule.startDate).tz(schedule.timezone);
      const fromTime = moment.max(now, startTime);

      // Simple implementation - in a real system you'd want more sophisticated logic
      const nextMinute = fromTime.clone().add(1, 'minute').startOf('minute');
      
      // For now, return next minute (this would be replaced with proper cron calculation)
      return nextMinute.toDate();
    } catch (error) {
      this.logger.error(`Error calculating next execution for schedule ${schedule.id}:`, error);
      return undefined;
    }
  }

  /**
   * Manual execution of a schedule (for testing or immediate execution)
   */
  async executeScheduleManually(scheduleId: string): Promise<boolean> {
    try {
      await this.executeSchedule(scheduleId);
      return true;
    } catch (error) {
      this.logger.error(`Manual execution failed for schedule ${scheduleId}:`, error);
      return false;
    }
  }

  /**
   * Get execution statistics
   */
  async getExecutionStats(): Promise<ExecutionStats> {
    const activeSchedules = await this.scheduleRepository.findActiveSchedules();
    
    let totalExecutions = 0;
    let totalFailures = 0;
    
    for (const schedule of activeSchedules) {
      totalExecutions += schedule.executionCount;
      totalFailures += schedule.failureCount;
    }

    return {
      totalActiveSchedules: activeSchedules.length,
      totalExecutions,
      totalFailures,
      successRate: totalExecutions > 0 ? (totalExecutions - totalFailures) / totalExecutions : 1,
      activeCronTasks: this.tasks.size
    };
  }
}

export interface SchedulerStatus {
  isRunning: boolean;
  activeTaskCount: number;
  activeTasks: string[];
}

export interface ExecutionStats {
  totalActiveSchedules: number;
  totalExecutions: number;
  totalFailures: number;
  successRate: number;
  activeCronTasks: number;
}
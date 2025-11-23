/**
 * Schedule Service Interface
 * 
 * Single Responsibility: Schedule content playback operations
 * Open/Closed: Extensible for different schedule types
 * Liskov Substitution: Any implementation should be substitutable
 * Interface Segregation: Focused on scheduling operations only
 * Dependency Inversion: Abstracts scheduling implementation
 */

export interface ScheduleCreateDto {
  contentId: string;
  name: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
  cronExpression: string;
  timezone: string;
  isActive: boolean;
  metadata?: Record<string, any>;
}

export interface ScheduleUpdateDto {
  name?: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  cronExpression?: string;
  timezone?: string;
  isActive?: boolean;
  metadata?: Record<string, any>;
}

export interface ScheduleFilter {
  contentId?: string;
  isActive?: boolean;
  timezone?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'startDate' | 'endDate' | 'createdAt' | 'nextExecutionAt';
  sortOrder?: 'asc' | 'desc';
}

export interface ScheduleExecutionResult {
  scheduleId: string;
  contentId: string;
  executedAt: Date;
  success: boolean;
  error?: string;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface IScheduleService {
  /**
   * Create a new schedule
   */
  createSchedule(userId: string, scheduleData: ScheduleCreateDto): Promise<Schedule>;

  /**
   * Get schedule by ID
   */
  getSchedule(scheduleId: string, userId: string): Promise<Schedule | null>;

  /**
   * Get all schedules with optional filtering
   */
  getSchedules(userId: string, filter?: ScheduleFilter): Promise<Schedule[]>;

  /**
   * Update schedule by ID
   */
  updateSchedule(scheduleId: string, userId: string, updateData: ScheduleUpdateDto): Promise<Schedule | null>;

  /**
   * Delete schedule by ID
   */
  deleteSchedule(scheduleId: string, userId: string): Promise<boolean>;

  /**
   * Activate/deactivate schedule
   */
  toggleSchedule(scheduleId: string, userId: string, isActive: boolean): Promise<boolean>;

  /**
   * Get upcoming schedule executions
   */
  getUpcomingExecutions(userId: string, limit?: number): Promise<UpcomingExecution[]>;

  /**
   * Get schedule execution history
   */
  getExecutionHistory(scheduleId: string, userId: string, limit?: number): Promise<ScheduleExecutionResult[]>;

  /**
   * Validate cron expression
   */
  validateCronExpression(expression: string): Promise<CronValidationResult>;

  /**
   * Preview schedule execution times
   */
  previewScheduleExecutions(cronExpression: string, timezone: string, count: number): Promise<Date[]>;
}

export interface Schedule {
  id: string;
  userId: string;
  contentId: string;
  name: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
  cronExpression: string;
  timezone: string;
  isActive: boolean;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  lastExecutedAt?: Date;
  nextExecutionAt?: Date;
  executionCount: number;
  failureCount: number;
}

export interface UpcomingExecution {
  scheduleId: string;
  scheduleName: string;
  contentId: string;
  contentTitle: string;
  executionTime: Date;
  timezone: string;
}

export interface CronValidationResult {
  isValid: boolean;
  errors: string[];
  nextExecutions?: Date[];
}
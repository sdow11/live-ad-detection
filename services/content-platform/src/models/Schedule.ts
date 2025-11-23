/**
 * Schedule Domain Model
 * 
 * Single Responsibility: Represent schedule data and business logic
 * Open/Closed: Extensible for additional schedule types
 * Liskov Substitution: Consistent interface for all schedule operations
 * Interface Segregation: Clean separation of concerns
 * Dependency Inversion: Independent of data persistence details
 */

export enum ScheduleStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  EXPIRED = 'expired',
  ERROR = 'error'
}

export interface ScheduleData {
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

export interface ScheduleCreateDto {
  contentId: string;
  name: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
  cronExpression: string;
  timezone: string;
  isActive?: boolean;
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

export class Schedule {
  public readonly id: string;
  public readonly userId: string;
  public readonly contentId: string;
  public readonly name: string;
  public readonly description?: string;
  public readonly startDate: Date;
  public readonly endDate?: Date;
  public readonly cronExpression: string;
  public readonly timezone: string;
  public readonly isActive: boolean;
  public readonly metadata: Record<string, any>;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly lastExecutedAt?: Date;
  public readonly nextExecutionAt?: Date;
  public readonly executionCount: number;
  public readonly failureCount: number;

  constructor(data: ScheduleData) {
    // Validate required fields
    if (!data.id || !data.userId || !data.contentId) {
      throw new Error('Schedule must have id, userId, and contentId');
    }

    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Schedule name is required and cannot be empty');
    }

    if (!data.cronExpression || data.cronExpression.trim().length === 0) {
      throw new Error('Cron expression is required and cannot be empty');
    }

    if (!data.timezone || data.timezone.trim().length === 0) {
      throw new Error('Timezone is required and cannot be empty');
    }

    if (!data.startDate) {
      throw new Error('Start date is required');
    }

    // Validate date logic
    if (data.endDate && data.endDate <= data.startDate) {
      throw new Error('End date must be after start date');
    }

    this.id = data.id;
    this.userId = data.userId;
    this.contentId = data.contentId;
    this.name = data.name.trim();
    this.description = data.description?.trim();
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.cronExpression = data.cronExpression.trim();
    this.timezone = data.timezone.trim();
    this.isActive = data.isActive;
    this.metadata = data.metadata || {};
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.lastExecutedAt = data.lastExecutedAt;
    this.nextExecutionAt = data.nextExecutionAt;
    this.executionCount = data.executionCount || 0;
    this.failureCount = data.failureCount || 0;
  }

  /**
   * Get current schedule status
   */
  getStatus(): ScheduleStatus {
    const now = new Date();

    if (!this.isActive) {
      return ScheduleStatus.INACTIVE;
    }

    if (this.endDate && now > this.endDate) {
      return ScheduleStatus.EXPIRED;
    }

    if (this.failureCount > 3) {
      return ScheduleStatus.ERROR;
    }

    return ScheduleStatus.ACTIVE;
  }

  /**
   * Check if schedule should be executed now
   */
  shouldExecuteNow(): boolean {
    const now = new Date();
    const status = this.getStatus();

    if (status !== ScheduleStatus.ACTIVE) {
      return false;
    }

    if (now < this.startDate) {
      return false;
    }

    if (!this.nextExecutionAt) {
      return false;
    }

    return now >= this.nextExecutionAt;
  }

  /**
   * Get schedule success rate
   */
  getSuccessRate(): number {
    if (this.executionCount === 0) {
      return 1; // 100% if never executed (optimistic)
    }

    const successCount = this.executionCount - this.failureCount;
    return successCount / this.executionCount;
  }

  /**
   * Check if schedule is overdue for execution
   */
  isOverdue(): boolean {
    if (!this.nextExecutionAt || !this.isActive) {
      return false;
    }

    const now = new Date();
    const overdueThreshold = 5 * 60 * 1000; // 5 minutes

    return (now.getTime() - this.nextExecutionAt.getTime()) > overdueThreshold;
  }

  /**
   * Get time until next execution
   */
  getTimeUntilNextExecution(): number | null {
    if (!this.nextExecutionAt) {
      return null;
    }

    const now = new Date();
    return this.nextExecutionAt.getTime() - now.getTime();
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): Record<string, any> {
    return {
      id: this.id,
      userId: this.userId,
      contentId: this.contentId,
      name: this.name,
      description: this.description,
      startDate: this.startDate,
      endDate: this.endDate,
      cronExpression: this.cronExpression,
      timezone: this.timezone,
      isActive: this.isActive,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastExecutedAt: this.lastExecutedAt,
      nextExecutionAt: this.nextExecutionAt,
      executionCount: this.executionCount,
      failureCount: this.failureCount,
      status: this.getStatus(),
      successRate: this.getSuccessRate(),
      isOverdue: this.isOverdue(),
      timeUntilNextExecution: this.getTimeUntilNextExecution(),
    };
  }
}
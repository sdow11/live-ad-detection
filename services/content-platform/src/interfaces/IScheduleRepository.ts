import { Schedule, ScheduleCreateDto, ScheduleUpdateDto, ScheduleFilter, ScheduleExecutionResult } from './IScheduleService';

/**
 * Schedule Repository Interface
 * 
 * Single Responsibility: Data access operations for schedules
 * Open/Closed: Extensible for different storage implementations
 * Liskov Substitution: Any implementation should be substitutable
 * Interface Segregation: Focused on data operations only
 * Dependency Inversion: Abstracts data persistence
 */
export interface IScheduleRepository {
  /**
   * Create a new schedule
   */
  create(scheduleData: ScheduleCreateDto & { userId: string }): Promise<Schedule>;

  /**
   * Find schedule by ID
   */
  findById(id: string): Promise<Schedule | null>;

  /**
   * Find schedules with filtering and pagination
   */
  findAll(filter?: ScheduleFilter & { userId?: string }): Promise<Schedule[]>;

  /**
   * Update schedule by ID
   */
  update(id: string, updateData: ScheduleUpdateDto): Promise<Schedule | null>;

  /**
   * Delete schedule by ID
   */
  delete(id: string): Promise<boolean>;

  /**
   * Find schedules by user ID
   */
  findByUserId(userId: string): Promise<Schedule[]>;

  /**
   * Find active schedules for execution
   */
  findActiveSchedules(): Promise<Schedule[]>;

  /**
   * Update last execution time and counters
   */
  updateExecutionStats(id: string, success: boolean, executedAt: Date, nextExecutionAt?: Date): Promise<void>;

  /**
   * Create execution log entry
   */
  createExecutionLog(executionData: ScheduleExecutionResult): Promise<void>;

  /**
   * Get execution history for a schedule
   */
  getExecutionHistory(scheduleId: string, limit?: number): Promise<ScheduleExecutionResult[]>;

  /**
   * Check if schedule exists and belongs to user
   */
  existsForUser(id: string, userId: string): Promise<boolean>;
}
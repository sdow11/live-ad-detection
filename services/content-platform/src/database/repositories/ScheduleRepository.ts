import { Repository, DataSource, FindOptionsWhere, In, LessThanOrEqual, MoreThanOrEqual, IsNull } from 'typeorm';
import { ScheduleEntity, ScheduleExecutionEntity } from '../entities/ScheduleEntity';
import { IScheduleRepository } from '../../interfaces/IScheduleRepository';
import { Schedule, ScheduleCreateDto, ScheduleUpdateDto, ScheduleFilter, ScheduleExecutionResult } from '../../interfaces/IScheduleService';
import { Schedule as ScheduleModel } from '../../models/Schedule';
import { v4 as uuidv4 } from 'uuid';

/**
 * Schedule Repository Implementation
 * 
 * Single Responsibility: Handle database operations for schedules
 * Open/Closed: Extensible for additional data operations
 * Liskov Substitution: Implements IScheduleRepository interface
 * Interface Segregation: Focused on data access only
 * Dependency Inversion: Depends on abstractions (IScheduleRepository)
 */
export class ScheduleRepository implements IScheduleRepository {
  private scheduleRepository: Repository<ScheduleEntity>;
  private executionRepository: Repository<ScheduleExecutionEntity>;

  constructor(private dataSource: DataSource) {
    this.scheduleRepository = dataSource.getRepository(ScheduleEntity);
    this.executionRepository = dataSource.getRepository(ScheduleExecutionEntity);
  }

  async create(scheduleData: ScheduleCreateDto & { userId: string }): Promise<Schedule> {
    const entity = new ScheduleEntity();
    entity.id = uuidv4();
    entity.userId = scheduleData.userId;
    entity.contentId = scheduleData.contentId;
    entity.name = scheduleData.name;
    entity.description = scheduleData.description;
    entity.startDate = scheduleData.startDate;
    entity.endDate = scheduleData.endDate;
    entity.cronExpression = scheduleData.cronExpression;
    entity.timezone = scheduleData.timezone;
    entity.isActive = scheduleData.isActive ?? true;
    entity.metadata = scheduleData.metadata ?? {};

    const savedEntity = await this.scheduleRepository.save(entity);
    return this.entityToModel(savedEntity);
  }

  async findById(id: string): Promise<Schedule | null> {
    const entity = await this.scheduleRepository.findOne({
      where: { id },
      relations: ['content']
    });

    return entity ? this.entityToModel(entity) : null;
  }

  async findAll(filter?: ScheduleFilter & { userId?: string }): Promise<Schedule[]> {
    const queryBuilder = this.scheduleRepository.createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.content', 'content');

    if (filter?.userId) {
      queryBuilder.andWhere('schedule.userId = :userId', { userId: filter.userId });
    }

    if (filter?.contentId) {
      queryBuilder.andWhere('schedule.contentId = :contentId', { contentId: filter.contentId });
    }

    if (filter?.isActive !== undefined) {
      queryBuilder.andWhere('schedule.isActive = :isActive', { isActive: filter.isActive });
    }

    if (filter?.timezone) {
      queryBuilder.andWhere('schedule.timezone = :timezone', { timezone: filter.timezone });
    }

    if (filter?.startDate) {
      queryBuilder.andWhere('schedule.startDate >= :startDate', { startDate: filter.startDate });
    }

    if (filter?.endDate) {
      queryBuilder.andWhere('schedule.endDate <= :endDate', { endDate: filter.endDate });
    }

    if (filter?.search) {
      queryBuilder.andWhere('(schedule.name ILIKE :search OR schedule.description ILIKE :search)', {
        search: `%${filter.search}%`
      });
    }

    // Sorting
    const sortBy = filter?.sortBy || 'createdAt';
    const sortOrder = filter?.sortOrder || 'desc';
    queryBuilder.orderBy(`schedule.${sortBy}`, sortOrder.toUpperCase() as 'ASC' | 'DESC');

    // Pagination
    if (filter?.limit) {
      queryBuilder.limit(filter.limit);
    }
    if (filter?.offset) {
      queryBuilder.offset(filter.offset);
    }

    const entities = await queryBuilder.getMany();
    return entities.map(entity => this.entityToModel(entity));
  }

  async update(id: string, updateData: ScheduleUpdateDto): Promise<Schedule | null> {
    const entity = await this.scheduleRepository.findOne({ where: { id } });
    if (!entity) {
      return null;
    }

    if (updateData.name !== undefined) entity.name = updateData.name;
    if (updateData.description !== undefined) entity.description = updateData.description;
    if (updateData.startDate !== undefined) entity.startDate = updateData.startDate;
    if (updateData.endDate !== undefined) entity.endDate = updateData.endDate;
    if (updateData.cronExpression !== undefined) entity.cronExpression = updateData.cronExpression;
    if (updateData.timezone !== undefined) entity.timezone = updateData.timezone;
    if (updateData.isActive !== undefined) entity.isActive = updateData.isActive;
    if (updateData.metadata !== undefined) entity.metadata = updateData.metadata;

    const savedEntity = await this.scheduleRepository.save(entity);
    return this.entityToModel(savedEntity);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.scheduleRepository.delete({ id });
    return (result.affected ?? 0) > 0;
  }

  async findByUserId(userId: string): Promise<Schedule[]> {
    const entities = await this.scheduleRepository.find({
      where: { userId },
      relations: ['content'],
      order: { createdAt: 'DESC' }
    });

    return entities.map(entity => this.entityToModel(entity));
  }

  async findActiveSchedules(): Promise<Schedule[]> {
    const now = new Date();
    const entities = await this.scheduleRepository.find({
      where: [
        {
          isActive: true,
          startDate: LessThanOrEqual(now),
          endDate: IsNull()
        },
        {
          isActive: true,
          startDate: LessThanOrEqual(now),
          endDate: MoreThanOrEqual(now)
        }
      ],
      relations: ['content'],
      order: { nextExecutionAt: 'ASC' }
    });

    return entities.map(entity => this.entityToModel(entity));
  }

  async updateExecutionStats(
    id: string, 
    success: boolean, 
    executedAt: Date, 
    nextExecutionAt?: Date
  ): Promise<void> {
    const entity = await this.scheduleRepository.findOne({ where: { id } });
    if (!entity) {
      throw new Error(`Schedule with id ${id} not found`);
    }

    entity.lastExecutedAt = executedAt;
    entity.executionCount += 1;
    
    if (!success) {
      entity.failureCount += 1;
    }

    if (nextExecutionAt) {
      entity.nextExecutionAt = nextExecutionAt;
    }

    await this.scheduleRepository.save(entity);
  }

  async createExecutionLog(executionData: ScheduleExecutionResult): Promise<void> {
    const execution = new ScheduleExecutionEntity();
    execution.id = uuidv4();
    execution.scheduleId = executionData.scheduleId;
    execution.contentId = executionData.contentId;
    execution.executedAt = executionData.executedAt;
    execution.success = executionData.success;
    execution.error = executionData.error;
    execution.duration = executionData.duration;
    execution.metadata = executionData.metadata ?? {};

    await this.executionRepository.save(execution);
  }

  async getExecutionHistory(scheduleId: string, limit = 50): Promise<ScheduleExecutionResult[]> {
    const entities = await this.executionRepository.find({
      where: { scheduleId },
      order: { executedAt: 'DESC' },
      take: limit
    });

    return entities.map(entity => ({
      scheduleId: entity.scheduleId,
      contentId: entity.contentId,
      executedAt: entity.executedAt,
      success: entity.success,
      error: entity.error,
      duration: entity.duration,
      metadata: entity.metadata
    }));
  }

  async existsForUser(id: string, userId: string): Promise<boolean> {
    const count = await this.scheduleRepository.count({
      where: { id, userId }
    });
    return count > 0;
  }

  /**
   * Convert entity to domain model
   */
  private entityToModel(entity: ScheduleEntity): Schedule {
    return new ScheduleModel({
      id: entity.id,
      userId: entity.userId,
      contentId: entity.contentId,
      name: entity.name,
      description: entity.description,
      startDate: entity.startDate,
      endDate: entity.endDate,
      cronExpression: entity.cronExpression,
      timezone: entity.timezone,
      isActive: entity.isActive,
      metadata: entity.metadata,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      lastExecutedAt: entity.lastExecutedAt,
      nextExecutionAt: entity.nextExecutionAt,
      executionCount: entity.executionCount,
      failureCount: entity.failureCount
    });
  }
}
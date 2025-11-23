import { ScheduleService } from '../../services/ScheduleService';
import { IScheduleRepository } from '../../interfaces/IScheduleRepository';
import { IContentRepository } from '../../interfaces/IContentRepository';
import { Schedule, ScheduleCreateDto, ScheduleUpdateDto } from '../../interfaces/IScheduleService';
import { Schedule as ScheduleModel } from '../../models/Schedule';

/**
 * Schedule Service Test Suite
 * 
 * Tests business logic for schedule management following TDD principles
 * Tests all SOLID principle implementations
 */
describe('ScheduleService', () => {
  let scheduleService: ScheduleService;
  let mockScheduleRepository: jest.Mocked<IScheduleRepository>;
  let mockContentRepository: jest.Mocked<IContentRepository>;

  const mockUserId = 'user-123';
  const mockContentId = 'content-456';
  const mockScheduleId = 'schedule-789';

  const mockContent = {
    id: mockContentId,
    userId: mockUserId,
    title: 'Test Content'
  } as any;

  const mockScheduleData: ScheduleCreateDto = {
    contentId: mockContentId,
    name: 'Test Schedule',
    description: 'Test schedule description',
    startDate: new Date('2024-01-01T09:00:00Z'),
    cronExpression: '0 9 * * 1-5', // 9 AM on weekdays
    timezone: 'America/New_York',
    isActive: true,
    metadata: { priority: 'high' }
  };

  const mockScheduleData_Model = {
    id: mockScheduleId,
    userId: mockUserId,
    contentId: mockContentId,
    name: 'Test Schedule',
    description: 'Test schedule description',
    startDate: new Date('2024-01-01T09:00:00Z'),
    cronExpression: '0 9 * * 1-5',
    timezone: 'America/New_York',
    isActive: true,
    metadata: { priority: 'high' },
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    executionCount: 0,
    failureCount: 0
  };
  
  const mockSchedule = new ScheduleModel(mockScheduleData_Model);

  beforeEach(() => {
    mockScheduleRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findByUserId: jest.fn(),
      findActiveSchedules: jest.fn(),
      updateExecutionStats: jest.fn(),
      createExecutionLog: jest.fn(),
      getExecutionHistory: jest.fn(),
      existsForUser: jest.fn()
    };

    mockContentRepository = {
      findById: jest.fn(),
      create: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findByUserId: jest.fn(),
      exists: jest.fn()
    };

    scheduleService = new ScheduleService(mockScheduleRepository, mockContentRepository);
  });

  describe('createSchedule', () => {
    beforeEach(() => {
      mockContentRepository.findById.mockResolvedValue(mockContent);
      mockScheduleRepository.create.mockResolvedValue(mockSchedule);
      mockScheduleRepository.updateExecutionStats.mockResolvedValue();
    });

    it('should create a new schedule successfully', async () => {
      const result = await scheduleService.createSchedule(mockUserId, mockScheduleData);

      expect(result).toEqual(mockSchedule);
      expect(mockContentRepository.findById).toHaveBeenCalledWith(mockContentId);
      expect(mockScheduleRepository.create).toHaveBeenCalledWith({
        ...mockScheduleData,
        userId: mockUserId
      });
    });

    it('should throw error if content not found', async () => {
      mockContentRepository.findById.mockResolvedValue(null);

      await expect(scheduleService.createSchedule(mockUserId, mockScheduleData))
        .rejects.toThrow('Content not found');

      expect(mockScheduleRepository.create).not.toHaveBeenCalled();
    });

    it('should throw error if content does not belong to user', async () => {
      mockContentRepository.findById.mockResolvedValue({
        ...mockContent,
        userId: 'different-user'
      });

      await expect(scheduleService.createSchedule(mockUserId, mockScheduleData))
        .rejects.toThrow('Content does not belong to user');

      expect(mockScheduleRepository.create).not.toHaveBeenCalled();
    });

    it('should throw error for invalid cron expression', async () => {
      const invalidScheduleData = {
        ...mockScheduleData,
        cronExpression: 'invalid-cron'
      };

      await expect(scheduleService.createSchedule(mockUserId, invalidScheduleData))
        .rejects.toThrow('Invalid cron expression');

      expect(mockScheduleRepository.create).not.toHaveBeenCalled();
    });

    it('should throw error for invalid timezone', async () => {
      const invalidScheduleData = {
        ...mockScheduleData,
        timezone: 'Invalid/Timezone'
      };

      await expect(scheduleService.createSchedule(mockUserId, invalidScheduleData))
        .rejects.toThrow('Invalid timezone');

      expect(mockScheduleRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('getSchedule', () => {
    it('should return schedule if found and belongs to user', async () => {
      mockScheduleRepository.findById.mockResolvedValue(mockSchedule);

      const result = await scheduleService.getSchedule(mockScheduleId, mockUserId);

      expect(result).toEqual(mockSchedule);
      expect(mockScheduleRepository.findById).toHaveBeenCalledWith(mockScheduleId);
    });

    it('should return null if schedule not found', async () => {
      mockScheduleRepository.findById.mockResolvedValue(null);

      const result = await scheduleService.getSchedule(mockScheduleId, mockUserId);

      expect(result).toBeNull();
    });

    it('should return null if schedule does not belong to user', async () => {
      const otherUserSchedule = new ScheduleModel({
        ...mockSchedule,
        userId: 'other-user'
      });
      mockScheduleRepository.findById.mockResolvedValue(otherUserSchedule);

      const result = await scheduleService.getSchedule(mockScheduleId, mockUserId);

      expect(result).toBeNull();
    });
  });

  describe('getSchedules', () => {
    it('should return all schedules for user', async () => {
      const schedules = [mockSchedule];
      mockScheduleRepository.findAll.mockResolvedValue(schedules);

      const result = await scheduleService.getSchedules(mockUserId);

      expect(result).toEqual(schedules);
      expect(mockScheduleRepository.findAll).toHaveBeenCalledWith({ userId: mockUserId });
    });

    it('should return filtered schedules', async () => {
      const filter = { isActive: true, contentId: mockContentId };
      const schedules = [mockSchedule];
      mockScheduleRepository.findAll.mockResolvedValue(schedules);

      const result = await scheduleService.getSchedules(mockUserId, filter);

      expect(result).toEqual(schedules);
      expect(mockScheduleRepository.findAll).toHaveBeenCalledWith({
        ...filter,
        userId: mockUserId
      });
    });
  });

  describe('updateSchedule', () => {
    const updateData: ScheduleUpdateDto = {
      name: 'Updated Schedule',
      cronExpression: '0 10 * * 1-5'
    };

    beforeEach(() => {
      mockScheduleRepository.existsForUser.mockResolvedValue(true);
      mockScheduleRepository.update.mockResolvedValue(mockSchedule);
      mockScheduleRepository.updateExecutionStats.mockResolvedValue();
    });

    it('should update schedule successfully', async () => {
      const result = await scheduleService.updateSchedule(mockScheduleId, mockUserId, updateData);

      expect(result).toEqual(mockSchedule);
      expect(mockScheduleRepository.existsForUser).toHaveBeenCalledWith(mockScheduleId, mockUserId);
      expect(mockScheduleRepository.update).toHaveBeenCalledWith(mockScheduleId, updateData);
    });

    it('should return null if schedule not found or does not belong to user', async () => {
      mockScheduleRepository.existsForUser.mockResolvedValue(false);

      const result = await scheduleService.updateSchedule(mockScheduleId, mockUserId, updateData);

      expect(result).toBeNull();
      expect(mockScheduleRepository.update).not.toHaveBeenCalled();
    });

    it('should throw error for invalid cron expression update', async () => {
      const invalidUpdate = { cronExpression: 'invalid-cron' };

      await expect(scheduleService.updateSchedule(mockScheduleId, mockUserId, invalidUpdate))
        .rejects.toThrow('Invalid cron expression');

      expect(mockScheduleRepository.update).not.toHaveBeenCalled();
    });

    it('should throw error for invalid timezone update', async () => {
      const invalidUpdate = { timezone: 'Invalid/Timezone' };

      await expect(scheduleService.updateSchedule(mockScheduleId, mockUserId, invalidUpdate))
        .rejects.toThrow('Invalid timezone');

      expect(mockScheduleRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteSchedule', () => {
    it('should delete schedule if it belongs to user', async () => {
      mockScheduleRepository.existsForUser.mockResolvedValue(true);
      mockScheduleRepository.delete.mockResolvedValue(true);

      const result = await scheduleService.deleteSchedule(mockScheduleId, mockUserId);

      expect(result).toBe(true);
      expect(mockScheduleRepository.existsForUser).toHaveBeenCalledWith(mockScheduleId, mockUserId);
      expect(mockScheduleRepository.delete).toHaveBeenCalledWith(mockScheduleId);
    });

    it('should return false if schedule does not belong to user', async () => {
      mockScheduleRepository.existsForUser.mockResolvedValue(false);

      const result = await scheduleService.deleteSchedule(mockScheduleId, mockUserId);

      expect(result).toBe(false);
      expect(mockScheduleRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('toggleSchedule', () => {
    beforeEach(() => {
      mockScheduleRepository.findById.mockResolvedValue(mockSchedule);
      mockScheduleRepository.update.mockResolvedValue(mockSchedule);
      mockScheduleRepository.updateExecutionStats.mockResolvedValue();
    });

    it('should activate schedule and calculate next execution time', async () => {
      const result = await scheduleService.toggleSchedule(mockScheduleId, mockUserId, true);

      expect(result).toBe(true);
      expect(mockScheduleRepository.update).toHaveBeenCalledWith(mockScheduleId, { isActive: true });
    });

    it('should deactivate schedule', async () => {
      const result = await scheduleService.toggleSchedule(mockScheduleId, mockUserId, false);

      expect(result).toBe(true);
      expect(mockScheduleRepository.update).toHaveBeenCalledWith(mockScheduleId, { isActive: false });
    });

    it('should return false if schedule not found', async () => {
      mockScheduleRepository.findById.mockResolvedValue(null);

      const result = await scheduleService.toggleSchedule(mockScheduleId, mockUserId, true);

      expect(result).toBe(false);
      expect(mockScheduleRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('validateCronExpression', () => {
    it('should validate valid cron expression', async () => {
      const result = await scheduleService.validateCronExpression('0 9 * * 1-5');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.nextExecutions).toBeDefined();
    });

    it('should invalidate invalid cron expression', async () => {
      const result = await scheduleService.validateCronExpression('invalid-cron');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid cron expression format');
      expect(result.nextExecutions).toBeUndefined();
    });
  });

  describe('previewScheduleExecutions', () => {
    it('should generate preview executions for valid inputs', async () => {
      const executions = await scheduleService.previewScheduleExecutions(
        '0 9 * * 1-5',
        'America/New_York',
        5
      );

      expect(executions).toHaveLength(5);
      expect(executions[0]).toBeInstanceOf(Date);
    });

    it('should throw error for invalid cron expression', async () => {
      await expect(scheduleService.previewScheduleExecutions(
        'invalid-cron',
        'America/New_York',
        5
      )).rejects.toThrow('Invalid cron expression');
    });

    it('should throw error for invalid timezone', async () => {
      await expect(scheduleService.previewScheduleExecutions(
        '0 9 * * 1-5',
        'Invalid/Timezone',
        5
      )).rejects.toThrow('Invalid timezone');
    });

    it('should limit execution count to 100', async () => {
      const executions = await scheduleService.previewScheduleExecutions(
        '* * * * *', // every minute
        'UTC',
        150
      );

      expect(executions.length).toBeLessThanOrEqual(100);
    });
  });

  describe('getUpcomingExecutions', () => {
    beforeEach(() => {
      mockScheduleRepository.findAll.mockResolvedValue([mockSchedule]);
      mockContentRepository.findById.mockResolvedValue(mockContent);
    });

    it('should return upcoming executions', async () => {
      const result = await scheduleService.getUpcomingExecutions(mockUserId, 5);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        scheduleId: mockScheduleId,
        scheduleName: 'Test Schedule',
        contentId: mockContentId,
        contentTitle: 'Test Content',
        executionTime: mockSchedule.nextExecutionAt,
        timezone: 'America/New_York'
      });
    });

    it('should handle missing content gracefully', async () => {
      mockContentRepository.findById.mockResolvedValue(null);

      const result = await scheduleService.getUpcomingExecutions(mockUserId, 5);

      expect(result).toHaveLength(1);
      expect(result[0].contentTitle).toBe('Unknown Content');
    });
  });

  describe('getExecutionHistory', () => {
    const mockHistory = [
      {
        scheduleId: mockScheduleId,
        contentId: mockContentId,
        executedAt: new Date(),
        success: true,
        duration: 1000
      }
    ];

    beforeEach(() => {
      mockScheduleRepository.findById.mockResolvedValue(mockSchedule);
      mockScheduleRepository.getExecutionHistory.mockResolvedValue(mockHistory);
    });

    it('should return execution history for valid schedule', async () => {
      const result = await scheduleService.getExecutionHistory(mockScheduleId, mockUserId, 10);

      expect(result).toEqual(mockHistory);
      expect(mockScheduleRepository.getExecutionHistory).toHaveBeenCalledWith(mockScheduleId, 10);
    });

    it('should throw error if schedule not found', async () => {
      mockScheduleRepository.findById.mockResolvedValue(null);

      await expect(scheduleService.getExecutionHistory(mockScheduleId, mockUserId, 10))
        .rejects.toThrow('Schedule not found or access denied');
    });

    it('should throw error if schedule does not belong to user', async () => {
      const otherUserSchedule = new ScheduleModel({
        ...mockSchedule,
        userId: 'other-user'
      });
      mockScheduleRepository.findById.mockResolvedValue(otherUserSchedule);

      await expect(scheduleService.getExecutionHistory(mockScheduleId, mockUserId, 10))
        .rejects.toThrow('Schedule not found or access denied');
    });
  });
});
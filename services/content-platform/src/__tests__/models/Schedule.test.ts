import { Schedule, ScheduleData, ScheduleStatus } from '../../models/Schedule';

/**
 * Schedule Model Test Suite
 * 
 * Tests domain model business logic and validation
 * Tests SOLID principles implementation in domain model
 */
describe('Schedule', () => {
  const validScheduleData: ScheduleData = {
    id: 'schedule-123',
    userId: 'user-456',
    contentId: 'content-789',
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

  describe('constructor', () => {
    it('should create schedule with valid data', () => {
      const schedule = new Schedule(validScheduleData);

      expect(schedule.id).toBe(validScheduleData.id);
      expect(schedule.userId).toBe(validScheduleData.userId);
      expect(schedule.contentId).toBe(validScheduleData.contentId);
      expect(schedule.name).toBe(validScheduleData.name);
      expect(schedule.description).toBe(validScheduleData.description);
      expect(schedule.startDate).toEqual(validScheduleData.startDate);
      expect(schedule.endDate).toBeUndefined();
      expect(schedule.cronExpression).toBe(validScheduleData.cronExpression);
      expect(schedule.timezone).toBe(validScheduleData.timezone);
      expect(schedule.isActive).toBe(validScheduleData.isActive);
      expect(schedule.metadata).toEqual(validScheduleData.metadata);
      expect(schedule.executionCount).toBe(0);
      expect(schedule.failureCount).toBe(0);
    });

    it('should trim whitespace from string fields', () => {
      const dataWithWhitespace = {
        ...validScheduleData,
        name: '  Test Schedule  ',
        description: '  Test description  ',
        cronExpression: '  0 9 * * 1-5  ',
        timezone: '  America/New_York  '
      };

      const schedule = new Schedule(dataWithWhitespace);

      expect(schedule.name).toBe('Test Schedule');
      expect(schedule.description).toBe('Test description');
      expect(schedule.cronExpression).toBe('0 9 * * 1-5');
      expect(schedule.timezone).toBe('America/New_York');
    });

    it('should set default values for optional fields', () => {
      const { description, endDate, lastExecutedAt, nextExecutionAt, ...requiredData } = validScheduleData;
      const minimalData = {
        ...requiredData,
        metadata: {} as Record<string, any>,
        executionCount: 0,
        failureCount: 0
      };

      const schedule = new Schedule(minimalData);

      expect(schedule.description).toBeUndefined();
      expect(schedule.endDate).toBeUndefined();
      expect(schedule.metadata).toEqual({});
      expect(schedule.lastExecutedAt).toBeUndefined();
      expect(schedule.nextExecutionAt).toBeUndefined();
      expect(schedule.executionCount).toBe(0);
      expect(schedule.failureCount).toBe(0);
    });

    describe('validation errors', () => {
      it('should throw error for missing id', () => {
        const invalidData = { ...validScheduleData, id: '' };
        
        expect(() => new Schedule(invalidData))
          .toThrow('Schedule must have id, userId, and contentId');
      });

      it('should throw error for missing userId', () => {
        const invalidData = { ...validScheduleData, userId: '' };
        
        expect(() => new Schedule(invalidData))
          .toThrow('Schedule must have id, userId, and contentId');
      });

      it('should throw error for missing contentId', () => {
        const invalidData = { ...validScheduleData, contentId: '' };
        
        expect(() => new Schedule(invalidData))
          .toThrow('Schedule must have id, userId, and contentId');
      });

      it('should throw error for empty name', () => {
        const invalidData = { ...validScheduleData, name: '' };
        
        expect(() => new Schedule(invalidData))
          .toThrow('Schedule name is required and cannot be empty');
      });

      it('should throw error for whitespace-only name', () => {
        const invalidData = { ...validScheduleData, name: '   ' };
        
        expect(() => new Schedule(invalidData))
          .toThrow('Schedule name is required and cannot be empty');
      });

      it('should throw error for empty cron expression', () => {
        const invalidData = { ...validScheduleData, cronExpression: '' };
        
        expect(() => new Schedule(invalidData))
          .toThrow('Cron expression is required and cannot be empty');
      });

      it('should throw error for empty timezone', () => {
        const invalidData = { ...validScheduleData, timezone: '' };
        
        expect(() => new Schedule(invalidData))
          .toThrow('Timezone is required and cannot be empty');
      });

      it('should throw error for missing start date', () => {
        const invalidData = { ...validScheduleData, startDate: null as any };
        
        expect(() => new Schedule(invalidData))
          .toThrow('Start date is required');
      });

      it('should throw error when end date is before start date', () => {
        const invalidData = {
          ...validScheduleData,
          startDate: new Date('2024-12-31T23:59:59Z'),
          endDate: new Date('2024-01-01T00:00:00Z')
        };
        
        expect(() => new Schedule(invalidData))
          .toThrow('End date must be after start date');
      });

      it('should throw error when end date equals start date', () => {
        const sameDate = new Date('2024-06-15T12:00:00Z');
        const invalidData = {
          ...validScheduleData,
          startDate: sameDate,
          endDate: sameDate
        };
        
        expect(() => new Schedule(invalidData))
          .toThrow('End date must be after start date');
      });
    });
  });

  describe('getStatus', () => {
    it('should return ACTIVE for active schedule within date range', () => {
      const now = new Date('2024-06-15T12:00:00Z');
      const schedule = new Schedule({
        ...validScheduleData,
        isActive: true,
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-12-31T23:59:59Z'),
        failureCount: 0
      });

      // Mock Date.now() to return our test date
      const originalNow = Date.now;
      Date.now = jest.fn(() => now.getTime());

      expect(schedule.getStatus()).toBe(ScheduleStatus.ACTIVE);

      Date.now = originalNow;
    });

    it('should return INACTIVE for inactive schedule', () => {
      const schedule = new Schedule({
        ...validScheduleData,
        isActive: false
      });

      expect(schedule.getStatus()).toBe(ScheduleStatus.INACTIVE);
    });

    it('should return EXPIRED for schedule past end date', () => {
      const now = new Date('2025-06-15T12:00:00Z');
      const schedule = new Schedule({
        ...validScheduleData,
        isActive: true,
        endDate: new Date('2024-12-31T23:59:59Z')
      });

      const originalNow = Date.now;
      Date.now = jest.fn(() => now.getTime());

      expect(schedule.getStatus()).toBe(ScheduleStatus.EXPIRED);

      Date.now = originalNow;
    });

    it('should return ERROR for schedule with too many failures', () => {
      const schedule = new Schedule({
        ...validScheduleData,
        isActive: true,
        failureCount: 5
      });

      expect(schedule.getStatus()).toBe(ScheduleStatus.ERROR);
    });

    it('should return ACTIVE for schedule with acceptable failure count', () => {
      const now = new Date('2024-06-15T12:00:00Z');
      const schedule = new Schedule({
        ...validScheduleData,
        isActive: true,
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-12-31T23:59:59Z'),
        failureCount: 3 // Threshold is > 3
      });

      const originalNow = Date.now;
      Date.now = jest.fn(() => now.getTime());

      expect(schedule.getStatus()).toBe(ScheduleStatus.ACTIVE);

      Date.now = originalNow;
    });
  });

  describe('shouldExecuteNow', () => {
    it('should return true for active schedule with valid execution time', () => {
      const now = new Date('2024-06-15T12:00:00Z');
      const schedule = new Schedule({
        ...validScheduleData,
        isActive: true,
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-12-31T23:59:59Z'),
        nextExecutionAt: new Date('2024-06-15T11:59:59Z'), // 1 second ago
        failureCount: 0
      });

      const originalNow = Date.now;
      Date.now = jest.fn(() => now.getTime());

      expect(schedule.shouldExecuteNow()).toBe(true);

      Date.now = originalNow;
    });

    it('should return false for inactive schedule', () => {
      const now = new Date('2024-06-15T12:00:00Z');
      const schedule = new Schedule({
        ...validScheduleData,
        isActive: false,
        nextExecutionAt: new Date('2024-06-15T11:59:59Z')
      });

      const originalNow = Date.now;
      Date.now = jest.fn(() => now.getTime());

      expect(schedule.shouldExecuteNow()).toBe(false);

      Date.now = originalNow;
    });

    it('should return false for schedule before start date', () => {
      const now = new Date('2023-12-15T12:00:00Z');
      const schedule = new Schedule({
        ...validScheduleData,
        isActive: true,
        startDate: new Date('2024-01-01T00:00:00Z'),
        nextExecutionAt: new Date('2023-12-15T11:59:59Z')
      });

      const originalNow = Date.now;
      Date.now = jest.fn(() => now.getTime());

      expect(schedule.shouldExecuteNow()).toBe(false);

      Date.now = originalNow;
    });

    it('should return false for schedule with no next execution time', () => {
      const now = new Date('2024-06-15T12:00:00Z');
      const schedule = new Schedule({
        ...validScheduleData,
        isActive: true,
        startDate: new Date('2024-01-01T00:00:00Z'),
        nextExecutionAt: undefined
      });

      const originalNow = Date.now;
      Date.now = jest.fn(() => now.getTime());

      expect(schedule.shouldExecuteNow()).toBe(false);

      Date.now = originalNow;
    });

    it('should return false for schedule with future execution time', () => {
      const now = new Date('2024-06-15T12:00:00Z');
      const schedule = new Schedule({
        ...validScheduleData,
        isActive: true,
        startDate: new Date('2024-01-01T00:00:00Z'),
        nextExecutionAt: new Date('2024-06-15T12:01:00Z') // 1 minute in future
      });

      const originalNow = Date.now;
      Date.now = jest.fn(() => now.getTime());

      expect(schedule.shouldExecuteNow()).toBe(false);

      Date.now = originalNow;
    });
  });

  describe('getSuccessRate', () => {
    it('should return 1.0 for schedule with no executions', () => {
      const schedule = new Schedule({
        ...validScheduleData,
        executionCount: 0,
        failureCount: 0
      });

      expect(schedule.getSuccessRate()).toBe(1);
    });

    it('should return correct success rate for schedule with executions', () => {
      const schedule = new Schedule({
        ...validScheduleData,
        executionCount: 10,
        failureCount: 2
      });

      expect(schedule.getSuccessRate()).toBe(0.8); // 8 successes / 10 total
    });

    it('should return 0 for schedule with all failures', () => {
      const schedule = new Schedule({
        ...validScheduleData,
        executionCount: 5,
        failureCount: 5
      });

      expect(schedule.getSuccessRate()).toBe(0);
    });

    it('should return 1 for schedule with all successes', () => {
      const schedule = new Schedule({
        ...validScheduleData,
        executionCount: 10,
        failureCount: 0
      });

      expect(schedule.getSuccessRate()).toBe(1);
    });
  });

  describe('isOverdue', () => {
    it('should return true for schedule overdue by more than 5 minutes', () => {
      const now = new Date('2024-06-15T12:10:00Z');
      const schedule = new Schedule({
        ...validScheduleData,
        isActive: true,
        nextExecutionAt: new Date('2024-06-15T12:00:00Z') // 10 minutes ago
      });

      const originalNow = Date.now;
      Date.now = jest.fn(() => now.getTime());

      expect(schedule.isOverdue()).toBe(true);

      Date.now = originalNow;
    });

    it('should return false for schedule overdue by less than 5 minutes', () => {
      const now = new Date('2024-06-15T12:03:00Z');
      const schedule = new Schedule({
        ...validScheduleData,
        isActive: true,
        nextExecutionAt: new Date('2024-06-15T12:00:00Z') // 3 minutes ago
      });

      const originalNow = Date.now;
      Date.now = jest.fn(() => now.getTime());

      expect(schedule.isOverdue()).toBe(false);

      Date.now = originalNow;
    });

    it('should return false for inactive schedule', () => {
      const now = new Date('2024-06-15T12:10:00Z');
      const schedule = new Schedule({
        ...validScheduleData,
        isActive: false,
        nextExecutionAt: new Date('2024-06-15T12:00:00Z')
      });

      const originalNow = Date.now;
      Date.now = jest.fn(() => now.getTime());

      expect(schedule.isOverdue()).toBe(false);

      Date.now = originalNow;
    });

    it('should return false for schedule with no next execution time', () => {
      const schedule = new Schedule({
        ...validScheduleData,
        isActive: true,
        nextExecutionAt: undefined
      });

      expect(schedule.isOverdue()).toBe(false);
    });
  });

  describe('getTimeUntilNextExecution', () => {
    it('should return correct time until next execution', () => {
      const now = new Date('2024-06-15T12:00:00Z');
      const nextExecution = new Date('2024-06-15T12:30:00Z');
      const schedule = new Schedule({
        ...validScheduleData,
        nextExecutionAt: nextExecution
      });

      const originalNow = Date.now;
      Date.now = jest.fn(() => now.getTime());

      const timeUntilNext = schedule.getTimeUntilNextExecution();
      expect(timeUntilNext).toBe(30 * 60 * 1000); // 30 minutes in milliseconds

      Date.now = originalNow;
    });

    it('should return negative value for overdue execution', () => {
      const now = new Date('2024-06-15T12:30:00Z');
      const nextExecution = new Date('2024-06-15T12:00:00Z');
      const schedule = new Schedule({
        ...validScheduleData,
        nextExecutionAt: nextExecution
      });

      const originalNow = Date.now;
      Date.now = jest.fn(() => now.getTime());

      const timeUntilNext = schedule.getTimeUntilNextExecution();
      expect(timeUntilNext).toBe(-30 * 60 * 1000); // -30 minutes

      Date.now = originalNow;
    });

    it('should return null for schedule with no next execution time', () => {
      const schedule = new Schedule({
        ...validScheduleData,
        nextExecutionAt: undefined
      });

      expect(schedule.getTimeUntilNextExecution()).toBeNull();
    });
  });

  describe('toJSON', () => {
    it('should return complete JSON representation', () => {
      const now = new Date('2024-06-15T12:00:00Z');
      const schedule = new Schedule({
        ...validScheduleData,
        executionCount: 10,
        failureCount: 2,
        nextExecutionAt: new Date('2024-06-15T13:00:00Z')
      });

      const originalNow = Date.now;
      Date.now = jest.fn(() => now.getTime());

      const json = schedule.toJSON();

      expect(json).toEqual({
        id: validScheduleData.id,
        userId: validScheduleData.userId,
        contentId: validScheduleData.contentId,
        name: validScheduleData.name,
        description: validScheduleData.description,
        startDate: validScheduleData.startDate,
        endDate: validScheduleData.endDate,
        cronExpression: validScheduleData.cronExpression,
        timezone: validScheduleData.timezone,
        isActive: validScheduleData.isActive,
        metadata: validScheduleData.metadata,
        createdAt: validScheduleData.createdAt,
        updatedAt: validScheduleData.updatedAt,
        lastExecutedAt: validScheduleData.lastExecutedAt,
        nextExecutionAt: schedule.nextExecutionAt,
        executionCount: 10,
        failureCount: 2,
        status: ScheduleStatus.ACTIVE,
        successRate: 0.8,
        isOverdue: false,
        timeUntilNextExecution: 60 * 60 * 1000 // 1 hour
      });

      Date.now = originalNow;
    });
  });
});
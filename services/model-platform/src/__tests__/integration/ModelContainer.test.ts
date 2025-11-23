import { DataSource } from 'typeorm';
import { ModelContainer } from '@/container/ModelContainer';
import { ModelEntity } from '@/database/entities/ModelEntity';

/**
 * Model Container Integration Tests
 * 
 * Tests the dependency injection container with in-memory database
 */

describe('ModelContainer Integration Tests', () => {
  let container: ModelContainer;
  let testDataSource: DataSource;

  beforeAll(async () => {
    // Create test database
    testDataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      dropSchema: true,
      synchronize: true,
      logging: false,
      entities: [ModelEntity],
    });

    container = ModelContainer.getInstance();
  });

  afterAll(async () => {
    if (container.isInitialized()) {
      await container.cleanup();
    }
    container.reset();
  });

  describe('Container Lifecycle', () => {
    it('should initialize container with all dependencies', async () => {
      expect(container.isInitialized()).toBe(false);

      await container.initialize(testDataSource);

      expect(container.isInitialized()).toBe(true);
      expect(container.dataSource).toBeDefined();
      expect(container.modelDownloader).toBeDefined();
      expect(container.modelValidator).toBeDefined();
      expect(container.modelRepository).toBeDefined();
      expect(container.modelService).toBeDefined();
      expect(container.modelController).toBeDefined();
    });

    it('should not reinitialize if already initialized', async () => {
      const firstDownloader = container.modelDownloader;
      
      // Try to initialize again
      await container.initialize(testDataSource);
      
      // Should be the same instance
      expect(container.modelDownloader).toBe(firstDownloader);
    });

    it('should throw error when accessing services before initialization', async () => {
      container.reset();
      
      expect(() => container.modelService).toThrow(
        'ModelContainer must be initialized before accessing services'
      );
    });

    it('should cleanup resources properly', async () => {
      await container.initialize(testDataSource);
      expect(container.isInitialized()).toBe(true);

      await container.cleanup();
      expect(container.isInitialized()).toBe(false);
    });
  });

  describe('Service Integration', () => {
    beforeEach(async () => {
      container.reset();
      await container.initialize(testDataSource);
    });

    it('should have properly wired dependencies', () => {
      const modelService = container.modelService;
      const modelController = container.modelController;

      expect(modelService).toBeDefined();
      expect(modelController).toBeDefined();
      
      // Test that services are properly injected
      expect(modelService.constructor.name).toBe('ModelService');
      expect(modelController.constructor.name).toBe('ModelController');
    });

    it('should create working model repository', async () => {
      const repository = container.modelRepository;
      
      // Test repository functionality
      const models = await repository.findAll();
      expect(Array.isArray(models)).toBe(true);
      expect(models).toHaveLength(0); // Empty initially
    });

    it('should create model validator with supported formats', () => {
      const validator = container.modelValidator;
      
      const supportedFormats = validator.getSupportedFormats();
      expect(Array.isArray(supportedFormats)).toBe(true);
      expect(supportedFormats.length).toBeGreaterThan(0);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = ModelContainer.getInstance();
      const instance2 = ModelContainer.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should maintain state across getInstance calls', async () => {
      const instance1 = ModelContainer.getInstance();
      await instance1.initialize(testDataSource);
      
      const instance2 = ModelContainer.getInstance();
      expect(instance2.isInitialized()).toBe(true);
    });
  });
});
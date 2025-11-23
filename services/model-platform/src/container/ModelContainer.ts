import { DataSource } from 'typeorm';
import { ModelDownloaderService } from '@/services/ModelDownloaderService';
import { ModelValidatorService } from '@/services/ModelValidatorService';
import { ModelRepositoryService } from '@/database/repositories/ModelRepositoryService';
import { ModelService } from '@/services/ModelService';
import { ModelController } from '@/controllers/ModelController';
import { AppDataSource } from '@/database/config/database.config';

/**
 * Model Dependency Injection Container
 * 
 * Single Responsibility: Wire up all model-related dependencies
 * Open/Closed: Extensible for new services
 * Dependency Inversion: Creates and manages abstractions
 */
export class ModelContainer {
  private static instance: ModelContainer;
  private initialized = false;

  // Service instances
  private _dataSource?: DataSource;
  private _modelDownloader?: ModelDownloaderService;
  private _modelValidator?: ModelValidatorService;
  private _modelRepository?: ModelRepositoryService;
  private _modelService?: ModelService;
  private _modelController?: ModelController;

  private constructor() {}

  /**
   * Singleton instance
   */
  public static getInstance(): ModelContainer {
    if (!ModelContainer.instance) {
      ModelContainer.instance = new ModelContainer();
    }
    return ModelContainer.instance;
  }

  /**
   * Initialize all dependencies
   */
  public async initialize(dataSource?: DataSource): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize database connection
      this._dataSource = dataSource || AppDataSource;
      if (!this._dataSource.isInitialized) {
        await this._dataSource.initialize();
      }

      // Create service instances with dependency injection
      this._modelDownloader = new ModelDownloaderService();
      this._modelValidator = new ModelValidatorService();
      this._modelRepository = new ModelRepositoryService(this._dataSource);
      
      // Create high-level service with injected dependencies
      this._modelService = new ModelService(
        this._modelDownloader,
        this._modelValidator,
        this._modelRepository
      );

      // Create controller with injected service
      this._modelController = new ModelController(this._modelService);

      this.initialized = true;
      console.log('Model container initialized successfully');
    } catch (error) {
      console.error('Failed to initialize model container:', error);
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    if (this._dataSource?.isInitialized) {
      await this._dataSource.destroy();
    }
    this.initialized = false;
    console.log('Model container cleaned up');
  }

  // Getters for dependency access

  public get dataSource(): DataSource {
    this.ensureInitialized();
    return this._dataSource!;
  }

  public get modelDownloader(): ModelDownloaderService {
    this.ensureInitialized();
    return this._modelDownloader!;
  }

  public get modelValidator(): ModelValidatorService {
    this.ensureInitialized();
    return this._modelValidator!;
  }

  public get modelRepository(): ModelRepositoryService {
    this.ensureInitialized();
    return this._modelRepository!;
  }

  public get modelService(): ModelService {
    this.ensureInitialized();
    return this._modelService!;
  }

  public get modelController(): ModelController {
    this.ensureInitialized();
    return this._modelController!;
  }

  /**
   * Check if container is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Reset container for testing
   */
  public reset(): void {
    this.initialized = false;
    this._dataSource = undefined;
    this._modelDownloader = undefined;
    this._modelValidator = undefined;
    this._modelRepository = undefined;
    this._modelService = undefined;
    this._modelController = undefined;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('ModelContainer must be initialized before accessing services');
    }
  }
}

/**
 * Convenience function to get initialized container instance
 */
export async function getModelContainer(dataSource?: DataSource): Promise<ModelContainer> {
  const container = ModelContainer.getInstance();
  if (!container.isInitialized()) {
    await container.initialize(dataSource);
  }
  return container;
}
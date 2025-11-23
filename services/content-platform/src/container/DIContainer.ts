import { AppDataSource } from '@/database/config/database.config';
import { ContentRepository } from '@/database/repositories/ContentRepository';
import { ContentService } from '@/services/ContentService';
import { LocalStorageService } from '@/services/LocalStorageService';
import { MediaProcessorService } from '@/services/MediaProcessorService';
import { ContentController } from '@/controllers/ContentController';
import { IContentRepository } from '@/interfaces/IContentRepository';
import { IContentService } from '@/interfaces/IContentService';
import { IStorageService } from '@/interfaces/IStorageService';
import { IMediaProcessor } from '@/interfaces/IMediaProcessor';

/**
 * Dependency Injection Container
 * 
 * Single Responsibility: Manage object creation and dependencies
 * Open/Closed: Can be extended with new services without modification
 * Liskov Substitution: Services implement their respective interfaces
 * Interface Segregation: Each service has a focused interface
 * Dependency Inversion: High-level modules depend on abstractions
 */
export class DIContainer {
  private contentRepository: IContentRepository | null = null;
  private storageService: IStorageService | null = null;
  private mediaProcessor: IMediaProcessor | null = null;
  private contentService: IContentService | null = null;
  private contentController: ContentController | null = null;

  /**
   * Initialize all services with proper dependency injection
   */
  initialize(): void {
    // Initialize in dependency order
    this.initializeRepositories();
    this.initializeServices();
    this.initializeControllers();
  }

  /**
   * Initialize repository layer
   */
  private initializeRepositories(): void {
    if (!this.contentRepository) {
      this.contentRepository = new ContentRepository();
    }
  }

  /**
   * Initialize service layer with injected dependencies
   */
  private initializeServices(): void {
    if (!this.storageService) {
      this.storageService = new LocalStorageService(
        process.env.STORAGE_PATH || '/tmp/uploads',
        process.env.STORAGE_URL || 'http://localhost:3000/files'
      );
    }

    if (!this.mediaProcessor) {
      this.mediaProcessor = new MediaProcessorService(
        process.env.FFMPEG_PATH,
        process.env.FFPROBE_PATH
      );
    }

    if (!this.contentService && this.contentRepository && this.storageService && this.mediaProcessor) {
      this.contentService = new ContentService(
        this.contentRepository,
        this.storageService,
        this.mediaProcessor
      );
    }
  }

  /**
   * Initialize controller layer with injected services
   */
  private initializeControllers(): void {
    if (!this.contentController && this.contentService) {
      this.contentController = new ContentController(this.contentService);
    }
  }

  /**
   * Get Content Repository instance
   */
  getContentRepository(): IContentRepository {
    if (!this.contentRepository) {
      throw new Error('ContentRepository not initialized. Call initialize() first.');
    }
    return this.contentRepository;
  }

  /**
   * Get Storage Service instance
   */
  getStorageService(): IStorageService {
    if (!this.storageService) {
      throw new Error('StorageService not initialized. Call initialize() first.');
    }
    return this.storageService;
  }

  /**
   * Get Media Processor instance
   */
  getMediaProcessor(): IMediaProcessor {
    if (!this.mediaProcessor) {
      throw new Error('MediaProcessor not initialized. Call initialize() first.');
    }
    return this.mediaProcessor;
  }

  /**
   * Get Content Service instance
   */
  getContentService(): IContentService {
    if (!this.contentService) {
      throw new Error('ContentService not initialized. Call initialize() first.');
    }
    return this.contentService;
  }

  /**
   * Get Content Controller instance
   */
  getContentController(): ContentController {
    if (!this.contentController) {
      throw new Error('ContentController not initialized. Call initialize() first.');
    }
    return this.contentController;
  }

  /**
   * Reset all instances (useful for testing)
   */
  reset(): void {
    this.contentRepository = null;
    this.storageService = null;
    this.mediaProcessor = null;
    this.contentService = null;
    this.contentController = null;
  }

  /**
   * Create a new instance for testing with mock dependencies
   */
  static createTestContainer(
    contentRepository?: IContentRepository,
    storageService?: IStorageService,
    mediaProcessor?: IMediaProcessor
  ): DIContainer {
    const container = new DIContainer();

    if (contentRepository) {
      container.contentRepository = contentRepository;
    }

    if (storageService) {
      container.storageService = storageService;
    }

    if (mediaProcessor) {
      container.mediaProcessor = mediaProcessor;
    }

    // Initialize remaining services
    container.initializeServices();
    container.initializeControllers();

    return container;
  }
}
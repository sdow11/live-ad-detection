import { AppDataSource } from '@/database/config/database.config';
import { ContentRepository } from '@/database/repositories/ContentRepository';
import { ScheduleRepository } from '@/database/repositories/ScheduleRepository';
import { ContentService } from '@/services/ContentService';
import { ScheduleService } from '@/services/ScheduleService';
import { PiPAutomationService } from '@/services/PiPAutomationService';
import { LocalStorageService } from '@/services/LocalStorageService';
import { MediaProcessorService } from '@/services/MediaProcessorService';
import { ContentController } from '@/controllers/ContentController';
import { ScheduleController } from '@/controllers/ScheduleController';
import { PiPController } from '@/controllers/PiPController';
import { IContentRepository } from '@/interfaces/IContentRepository';
import { IScheduleRepository } from '@/interfaces/IScheduleRepository';
import { IContentService } from '@/interfaces/IContentService';
import { IScheduleService } from '@/interfaces/IScheduleService';
import { IPiPAutomationService } from '@/interfaces/IPiPAutomationService';
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
  private scheduleRepository: IScheduleRepository | null = null;
  private storageService: IStorageService | null = null;
  private mediaProcessor: IMediaProcessor | null = null;
  private contentService: IContentService | null = null;
  private scheduleService: IScheduleService | null = null;
  private pipAutomationService: IPiPAutomationService | null = null;
  private contentController: ContentController | null = null;
  private scheduleController: ScheduleController | null = null;
  private pipController: PiPController | null = null;

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

    if (!this.scheduleRepository) {
      this.scheduleRepository = new ScheduleRepository();
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

    if (!this.scheduleService && this.scheduleRepository) {
      this.scheduleService = new ScheduleService(this.scheduleRepository);
    }

    if (!this.pipAutomationService && this.scheduleService && this.contentService) {
      this.pipAutomationService = new PiPAutomationService(
        this.scheduleService,
        this.contentService
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

    if (!this.scheduleController && this.scheduleService) {
      this.scheduleController = new ScheduleController(this.scheduleService);
    }

    if (!this.pipController && this.pipAutomationService) {
      this.pipController = new PiPController(this.pipAutomationService);
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
   * Get Schedule Repository instance
   */
  getScheduleRepository(): IScheduleRepository {
    if (!this.scheduleRepository) {
      throw new Error('ScheduleRepository not initialized. Call initialize() first.');
    }
    return this.scheduleRepository;
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
   * Get Schedule Service instance
   */
  getScheduleService(): IScheduleService {
    if (!this.scheduleService) {
      throw new Error('ScheduleService not initialized. Call initialize() first.');
    }
    return this.scheduleService;
  }

  /**
   * Get PiP Automation Service instance
   */
  getPiPAutomationService(): IPiPAutomationService {
    if (!this.pipAutomationService) {
      throw new Error('PiPAutomationService not initialized. Call initialize() first.');
    }
    return this.pipAutomationService;
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
   * Get Schedule Controller instance
   */
  getScheduleController(): ScheduleController {
    if (!this.scheduleController) {
      throw new Error('ScheduleController not initialized. Call initialize() first.');
    }
    return this.scheduleController;
  }

  /**
   * Get PiP Controller instance
   */
  getPiPController(): PiPController {
    if (!this.pipController) {
      throw new Error('PiPController not initialized. Call initialize() first.');
    }
    return this.pipController;
  }

  /**
   * Reset all instances (useful for testing)
   */
  reset(): void {
    this.contentRepository = null;
    this.scheduleRepository = null;
    this.storageService = null;
    this.mediaProcessor = null;
    this.contentService = null;
    this.scheduleService = null;
    this.pipAutomationService = null;
    this.contentController = null;
    this.scheduleController = null;
    this.pipController = null;
  }

  /**
   * Create a new instance for testing with mock dependencies
   */
  static createTestContainer(
    contentRepository?: IContentRepository,
    scheduleRepository?: IScheduleRepository,
    storageService?: IStorageService,
    mediaProcessor?: IMediaProcessor
  ): DIContainer {
    const container = new DIContainer();

    if (contentRepository) {
      container.contentRepository = contentRepository;
    }

    if (scheduleRepository) {
      container.scheduleRepository = scheduleRepository;
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
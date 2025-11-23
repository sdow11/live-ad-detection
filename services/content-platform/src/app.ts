import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import { AppDataSource } from '@/database/config/database.config';
import { DIContainer } from '@/container/DIContainer';
import { ContentController } from '@/controllers/ContentController';
import { errorHandler, notFoundHandler } from '@/middleware/errorHandlers';
import { authMiddleware } from '@/middleware/auth';
import { validateContentUpload } from '@/middleware/validation';

/**
 * Express Application with Dependency Injection
 * 
 * Single Responsibility: Handle HTTP server setup and routing
 * Open/Closed: Extensible for additional routes and middleware
 * Liskov Substitution: Uses standard Express interfaces
 * Interface Segregation: Separates concerns between routing and business logic
 * Dependency Inversion: Uses dependency injection for all services
 */
export class App {
  private app: express.Application;
  private diContainer: DIContainer;
  private contentController: ContentController;

  constructor() {
    this.app = express();
    this.diContainer = new DIContainer();
    this.setupServices();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Initialize application services using dependency injection
   */
  private setupServices(): void {
    // Initialize dependency injection container
    this.diContainer.initialize();
    
    // Get controllers from DI container
    this.contentController = this.diContainer.getContentController();
  }

  /**
   * Configure Express middleware
   */
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
    }));

    // Logging middleware
    this.app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

    // Body parsing middleware
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // File upload middleware
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 2 * 1024 * 1024 * 1024, // 2GB limit
      },
      fileFilter: (req, file, cb) => {
        // Allow videos and images
        const allowedMimeTypes = [
          'video/mp4',
          'video/quicktime',
          'video/x-msvideo',
          'video/webm',
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
        ];
        
        if (allowedMimeTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error(`Unsupported file type: ${file.mimetype}`));
        }
      },
    });

    // Make upload middleware available to routes
    this.app.locals.upload = upload;
  }

  /**
   * Setup application routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
      });
    });

    // API documentation endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        name: 'Content Platform API',
        version: process.env.npm_package_version || '1.0.0',
        endpoints: {
          'GET /health': 'Health check',
          'GET /api': 'API documentation',
          'POST /api/v1/content': 'Upload content',
          'GET /api/v1/content': 'List content',
          'GET /api/v1/content/:id': 'Get content by ID',
          'PUT /api/v1/content/:id': 'Update content',
          'DELETE /api/v1/content/:id': 'Delete content',
        },
      });
    });

    // Content API routes
    this.setupContentRoutes();

    // Serve static files
    this.app.use('/files', express.static(
      process.env.STORAGE_PATH || '/tmp/uploads',
      {
        maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
        etag: true,
      }
    ));
  }

  /**
   * Setup content-specific routes
   */
  private setupContentRoutes(): void {
    const router = express.Router();
    const upload = this.app.locals.upload;

    // Apply authentication middleware to all content routes
    router.use(authMiddleware);

    // Content CRUD operations
    router.post('/', 
      upload.single('file'), 
      validateContentUpload, 
      this.contentController.createContent.bind(this.contentController)
    );

    router.get('/', 
      this.contentController.listContent.bind(this.contentController)
    );

    router.get('/:id', 
      this.contentController.getContent.bind(this.contentController)
    );

    router.put('/:id', 
      this.contentController.updateContent.bind(this.contentController)
    );

    router.delete('/:id', 
      this.contentController.deleteContent.bind(this.contentController)
    );

    // Additional content operations
    router.get('/:id/thumbnail', 
      this.contentController.getContentThumbnail.bind(this.contentController)
    );

    router.post('/:id/transcode', 
      this.contentController.transcodeContent.bind(this.contentController)
    );

    router.get('/user/:userId', 
      this.contentController.getUserContent.bind(this.contentController)
    );

    // Mount content routes
    this.app.use('/api/v1/content', router);
  }

  /**
   * Setup error handling middleware
   */
  private setupErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }

  /**
   * Initialize database connection
   */
  async initializeDatabase(): Promise<void> {
    try {
      await AppDataSource.initialize();
      console.log('Database connection established successfully');
    } catch (error) {
      console.error('Database connection failed:', error);
      throw error;
    }
  }

  /**
   * Start the Express server
   */
  async start(port: number = 3000): Promise<void> {
    try {
      // Initialize database connection
      await this.initializeDatabase();

      // Start server
      this.app.listen(port, () => {
        console.log(`Content Platform API server running on port ${port}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`API Documentation: http://localhost:${port}/api`);
      });
    } catch (error) {
      console.error('Failed to start application:', error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    try {
      console.log('Shutting down application...');
      
      if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
        console.log('Database connection closed');
      }
      
      console.log('Application shutdown completed');
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }

  /**
   * Get Express application instance (for testing)
   */
  getApp(): express.Application {
    return this.app;
  }
}
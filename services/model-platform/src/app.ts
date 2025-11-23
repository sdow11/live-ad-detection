import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import { getModelContainer } from '@/container/ModelContainer';
import { createModelRoutes } from '@/routes/modelRoutes';

/**
 * Model Platform Express Application
 * 
 * Creates and configures the Express app with all model management routes
 * Follows SOLID principles with proper dependency injection
 */
export async function createApp(): Promise<Application> {
  const app: Application = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
  });
  app.use('/api/', limiter);

  // Body parsing middleware
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    });
    next();
  });

  // Initialize dependency injection container
  const container = await getModelContainer();

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database: container.dataSource.isInitialized,
        modelContainer: container.isInitialized(),
      },
    });
  });

  // API Documentation
  app.get('/api', (req: Request, res: Response) => {
    res.json({
      name: 'Model Platform API',
      version: '1.0.0',
      description: 'AI Model Management Platform',
      endpoints: {
        models: '/api/models',
        install: 'POST /api/models/install',
        search: 'GET /api/models/search?q=query',
        stats: 'GET /api/models/stats',
        health: 'GET /health',
      },
      documentation: 'https://docs.example.com/model-platform',
    });
  });

  // Model API routes
  app.use('/api/models', createModelRoutes(container.modelController));

  // 404 handler
  app.use('*', (req: Request, res: Response) => {
    res.status(404).json({
      error: 'Endpoint not found',
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
    });
  });

  // Global error handler
  app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled error:', error);

    // Don't expose internal errors in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    res.status(500).json({
      error: 'Internal server error',
      message: isDevelopment ? error.message : 'Something went wrong',
      timestamp: new Date().toISOString(),
      ...(isDevelopment && { stack: error.stack }),
    });
  });

  return app;
}

/**
 * Start the server
 */
export async function startServer(port: number = 3001): Promise<void> {
  try {
    const app = await createApp();
    
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 Model Platform server running on port ${port}`);
      console.log(`📚 API documentation: http://localhost:${port}/api`);
      console.log(`❤️  Health check: http://localhost:${port}/health`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      
      server.close(async () => {
        try {
          // Clean up container resources
          const container = await getModelContainer();
          await container.cleanup();
          
          console.log('Server shut down successfully');
          process.exit(0);
        } catch (error) {
          console.error('Error during shutdown:', error);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const port = parseInt(process.env.PORT || '3001');
  startServer(port);
}
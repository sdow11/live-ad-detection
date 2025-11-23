import { Router } from 'express';
import { ModelController } from '@/controllers/ModelController';

/**
 * Model Routes
 * 
 * Defines REST API routes for model management operations
 * Following RESTful conventions and proper HTTP methods
 */
export function createModelRoutes(modelController: ModelController): Router {
  const router = Router();

  // Model installation and management
  router.post('/install', modelController.installModel.bind(modelController));
  router.delete('/:id', modelController.uninstallModel.bind(modelController));
  
  // Model querying and search
  router.get('/', modelController.listModels.bind(modelController));
  router.get('/search', modelController.searchModels.bind(modelController));
  router.get('/latest', modelController.getLatestModels.bind(modelController));
  router.get('/stats', modelController.getModelStatistics.bind(modelController));
  router.get('/capabilities/:capability', modelController.getModelsByCapability.bind(modelController));
  router.get('/:id', modelController.getModel.bind(modelController));
  
  // Model operations
  router.patch('/:id', modelController.updateModel.bind(modelController));
  router.post('/:id/validate', modelController.validateModel.bind(modelController));
  router.post('/:id/compatibility', modelController.checkCompatibility.bind(modelController));

  return router;
}

/**
 * Route Documentation
 * 
 * POST   /api/models/install              - Install a new model
 * DELETE /api/models/:id                  - Uninstall a model
 * GET    /api/models                      - List all models with filtering
 * GET    /api/models/search?q=query       - Search models by text query
 * GET    /api/models/latest               - Get latest model versions
 * GET    /api/models/stats                - Get model statistics
 * GET    /api/models/capabilities/:cap    - Get models by capability
 * GET    /api/models/:id                  - Get specific model
 * PATCH  /api/models/:id                  - Update model metadata
 * POST   /api/models/:id/validate         - Validate model file
 * POST   /api/models/:id/compatibility    - Check platform compatibility
 */
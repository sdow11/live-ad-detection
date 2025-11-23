import { Request, Response } from 'express';
import { ModelService } from '@/services/ModelService';
import { ModelType, MLFramework, ModelCapability } from '@/interfaces/IModelRepository';
import { ValidationError } from '@/utils/errors';

/**
 * Model Controller
 * 
 * Single Responsibility: Handle HTTP requests for model management
 * Open/Closed: Extensible for new endpoints
 * Liskov Substitution: Follows Express Request/Response contracts
 * Interface Segregation: Focused on model API operations
 * Dependency Inversion: Depends on ModelService abstraction
 */
export class ModelController {
  constructor(private readonly modelService: ModelService) {}

  /**
   * POST /api/models/install
   * Install a new model
   */
  async installModel(req: Request, res: Response): Promise<void> {
    try {
      const {
        name,
        version,
        description,
        modelType,
        framework,
        downloadUrl,
        fileSize,
        checksum,
        tags = [],
        minFrameworkVersion,
        requiredGPU = false,
        capabilities,
        options = {}
      } = req.body;

      // Validate required fields
      if (!name || !version || !modelType || !framework || !downloadUrl || !capabilities) {
        res.status(400).json({
          error: 'Missing required fields',
          required: ['name', 'version', 'modelType', 'framework', 'downloadUrl', 'capabilities'],
        });
        return;
      }

      // Validate enums
      if (!Object.values(ModelType).includes(modelType)) {
        res.status(400).json({
          error: 'Invalid modelType',
          validValues: Object.values(ModelType),
        });
        return;
      }

      if (!Object.values(MLFramework).includes(framework)) {
        res.status(400).json({
          error: 'Invalid framework',
          validValues: Object.values(MLFramework),
        });
        return;
      }

      if (!Array.isArray(capabilities) || capabilities.length === 0) {
        res.status(400).json({
          error: 'Capabilities must be a non-empty array',
          validValues: Object.values(ModelCapability),
        });
        return;
      }

      for (const capability of capabilities) {
        if (!Object.values(ModelCapability).includes(capability)) {
          res.status(400).json({
            error: `Invalid capability: ${capability}`,
            validValues: Object.values(ModelCapability),
          });
          return;
        }
      }

      const installRequest = {
        modelData: {
          name,
          version,
          description,
          modelType,
          framework,
          downloadUrl,
          fileSize: fileSize || 0,
          checksum: checksum || '',
          tags,
          minFrameworkVersion,
          requiredGPU,
          capabilities,
        },
        options,
      };

      const result = await this.modelService.installModel(installRequest);

      if (result.success) {
        res.status(201).json({
          success: true,
          message: 'Model installed successfully',
          data: {
            model: result.model,
            localPath: result.localPath,
            metadata: result.metadata,
          },
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          details: result.details,
          metadata: result.metadata,
        });
      }
    } catch (error: any) {
      console.error('Error installing model:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
      });
    }
  }

  /**
   * DELETE /api/models/:id
   * Uninstall a model
   */
  async uninstallModel(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { keepFiles = false } = req.body;

      const success = await this.modelService.uninstallModel(id, { keepFiles });

      if (success) {
        res.json({
          success: true,
          message: 'Model uninstalled successfully',
          data: { modelId: id, filesRemoved: !keepFiles },
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Model not found or could not be uninstalled',
        });
      }
    } catch (error: any) {
      console.error('Error uninstalling model:', error);
      
      if (error instanceof ValidationError) {
        res.status(404).json({
          error: error.message,
          details: error.details,
        });
      } else {
        res.status(500).json({
          error: 'Internal server error',
          message: error.message,
        });
      }
    }
  }

  /**
   * GET /api/models
   * List models with optional filtering
   */
  async listModels(req: Request, res: Response): Promise<void> {
    try {
      const {
        modelType,
        framework,
        capabilities,
        tags,
        minFileSize,
        maxFileSize,
        search,
        limit,
        offset,
        sortBy,
        sortOrder,
      } = req.query;

      const filter: any = {};

      if (modelType) filter.modelType = modelType;
      if (framework) filter.framework = framework;
      if (capabilities) {
        filter.capabilities = Array.isArray(capabilities) 
          ? capabilities 
          : [capabilities];
      }
      if (tags) {
        filter.tags = Array.isArray(tags) ? tags : [tags];
      }
      if (minFileSize) filter.minFileSize = parseInt(minFileSize as string);
      if (maxFileSize) filter.maxFileSize = parseInt(maxFileSize as string);
      if (search) filter.search = search as string;
      if (limit) filter.limit = parseInt(limit as string);
      if (offset) filter.offset = parseInt(offset as string);
      if (sortBy) filter.sortBy = sortBy as string;
      if (sortOrder) filter.sortOrder = sortOrder as string;

      const models = await this.modelService.listModels(filter);

      res.json({
        success: true,
        data: {
          models,
          count: models.length,
          filter,
        },
      });
    } catch (error: any) {
      console.error('Error listing models:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
      });
    }
  }

  /**
   * GET /api/models/:id
   * Get model by ID
   */
  async getModel(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const model = await this.modelService.getModel(id);

      if (model) {
        res.json({
          success: true,
          data: { model },
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Model not found',
        });
      }
    } catch (error: any) {
      console.error('Error getting model:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
      });
    }
  }

  /**
   * GET /api/models/search
   * Search models by query
   */
  async searchModels(req: Request, res: Response): Promise<void> {
    try {
      const { q: query } = req.query;

      if (!query || typeof query !== 'string') {
        res.status(400).json({
          error: 'Query parameter "q" is required',
        });
        return;
      }

      const models = await this.modelService.searchModels(query);

      res.json({
        success: true,
        data: {
          models,
          count: models.length,
          query,
        },
      });
    } catch (error: any) {
      console.error('Error searching models:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
      });
    }
  }

  /**
   * GET /api/models/capabilities/:capability
   * Get models by capability
   */
  async getModelsByCapability(req: Request, res: Response): Promise<void> {
    try {
      const { capability } = req.params;

      if (!Object.values(ModelCapability).includes(capability as ModelCapability)) {
        res.status(400).json({
          error: 'Invalid capability',
          validValues: Object.values(ModelCapability),
        });
        return;
      }

      const models = await this.modelService.getModelsByCapability(capability);

      res.json({
        success: true,
        data: {
          models,
          count: models.length,
          capability,
        },
      });
    } catch (error: any) {
      console.error('Error getting models by capability:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
      });
    }
  }

  /**
   * GET /api/models/latest
   * Get latest model versions
   */
  async getLatestModels(req: Request, res: Response): Promise<void> {
    try {
      const models = await this.modelService.getLatestModels();

      res.json({
        success: true,
        data: {
          models,
          count: models.length,
        },
      });
    } catch (error: any) {
      console.error('Error getting latest models:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
      });
    }
  }

  /**
   * PATCH /api/models/:id
   * Update model metadata
   */
  async updateModel(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Remove undefined fields
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      if (Object.keys(updateData).length === 0) {
        res.status(400).json({
          error: 'No update data provided',
        });
        return;
      }

      const updatedModel = await this.modelService.updateModel(id, updateData);

      if (updatedModel) {
        res.json({
          success: true,
          message: 'Model updated successfully',
          data: { model: updatedModel },
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Model not found',
        });
      }
    } catch (error: any) {
      console.error('Error updating model:', error);
      
      if (error instanceof ValidationError) {
        res.status(400).json({
          error: error.message,
          details: error.details,
        });
      } else {
        res.status(500).json({
          error: 'Internal server error',
          message: error.message,
        });
      }
    }
  }

  /**
   * POST /api/models/:id/validate
   * Validate existing model file
   */
  async validateModel(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const validationResult = await this.modelService.validateExistingModel(id);

      res.json({
        success: true,
        data: {
          modelId: id,
          validation: validationResult,
        },
      });
    } catch (error: any) {
      console.error('Error validating model:', error);
      
      if (error instanceof ValidationError) {
        res.status(404).json({
          error: error.message,
          details: error.details,
        });
      } else {
        res.status(500).json({
          error: 'Internal server error',
          message: error.message,
        });
      }
    }
  }

  /**
   * GET /api/models/stats
   * Get model statistics
   */
  async getModelStatistics(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.modelService.getModelStatistics();

      res.json({
        success: true,
        data: { statistics: stats },
      });
    } catch (error: any) {
      console.error('Error getting model statistics:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
      });
    }
  }

  /**
   * POST /api/models/:id/compatibility
   * Check model platform compatibility
   */
  async checkCompatibility(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { platform } = req.body;

      if (!platform || typeof platform !== 'string') {
        res.status(400).json({
          error: 'Platform is required',
        });
        return;
      }

      const compatibility = await this.modelService.checkModelCompatibility(id, platform);

      res.json({
        success: true,
        data: {
          modelId: id,
          compatibility,
        },
      });
    } catch (error: any) {
      console.error('Error checking model compatibility:', error);
      
      if (error instanceof ValidationError) {
        res.status(404).json({
          error: error.message,
          details: error.details,
        });
      } else {
        res.status(500).json({
          error: 'Internal server error',
          message: error.message,
        });
      }
    }
  }
}
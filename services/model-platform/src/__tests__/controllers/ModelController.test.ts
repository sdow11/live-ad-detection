import { Request, Response } from 'express';
import { ModelController } from '@/controllers/ModelController';
import { ModelService } from '@/services/ModelService';
import { ModelType, MLFramework, ModelCapability } from '@/interfaces/IModelRepository';
import { ValidationError } from '@/utils/errors';

/**
 * Model Controller Unit Tests
 * 
 * Tests the REST API controller for model management
 * Following TDD approach with comprehensive mocking
 */

describe('ModelController', () => {
  let modelController: ModelController;
  let mockModelService: any;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    // Create mock ModelService
    mockModelService = {
      installModel: jest.fn(),
      uninstallModel: jest.fn(),
      listModels: jest.fn(),
      getModel: jest.fn(),
      searchModels: jest.fn(),
      getModelsByCapability: jest.fn(),
      getLatestModels: jest.fn(),
      updateModel: jest.fn(),
      validateExistingModel: jest.fn(),
      getModelStatistics: jest.fn(),
      checkModelCompatibility: jest.fn(),
    } as any;

    modelController = new ModelController(mockModelService);

    // Create mock Express objects
    mockRequest = {};
    mockResponse = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
  });

  const mockModelData = {
    id: 'model-123',
    name: 'test-model',
    version: '1.0.0',
    description: 'Test model',
    modelType: ModelType.OBJECT_DETECTION,
    framework: MLFramework.TENSORFLOW,
    downloadUrl: 'https://example.com/model.tflite',
    fileSize: 1024 * 1024,
    checksum: 'a'.repeat(64),
    tags: ['test', 'detection'],
    capabilities: [ModelCapability.AD_DETECTION],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('installModel()', () => {
    it('should successfully install a model', async () => {
      const requestBody = {
        name: 'test-model',
        version: '1.0.0',
        modelType: ModelType.OBJECT_DETECTION,
        framework: MLFramework.TENSORFLOW,
        downloadUrl: 'https://example.com/model.tflite',
        capabilities: [ModelCapability.AD_DETECTION],
      };

      mockRequest.body = requestBody;

      mockModelService.installModel.mockResolvedValue({
        success: true,
        model: mockModelData,
        localPath: '/models/test-model_v1.0.0.tflite',
        metadata: {
          installTime: new Date(),
          downloadSize: 1024 * 1024,
          validationPassed: true,
          overwritten: false,
        },
      });

      await modelController.installModel(mockRequest as Request, mockResponse as Response);

      expect(mockModelService.installModel).toHaveBeenCalledWith({
        modelData: expect.objectContaining(requestBody),
        options: {},
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Model installed successfully',
        data: expect.objectContaining({
          model: mockModelData,
        }),
      });
    });

    it('should validate required fields', async () => {
      mockRequest.body = { name: 'test-model' }; // Missing required fields

      await modelController.installModel(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Missing required fields',
        required: ['name', 'version', 'modelType', 'framework', 'downloadUrl', 'capabilities'],
      });
      expect(mockModelService.installModel).not.toHaveBeenCalled();
    });

    it('should validate model type enum', async () => {
      mockRequest.body = {
        name: 'test-model',
        version: '1.0.0',
        modelType: 'invalid_type',
        framework: MLFramework.TENSORFLOW,
        downloadUrl: 'https://example.com/model.tflite',
        capabilities: [ModelCapability.AD_DETECTION],
      };

      await modelController.installModel(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid modelType',
        validValues: Object.values(ModelType),
      });
    });

    it('should validate framework enum', async () => {
      mockRequest.body = {
        name: 'test-model',
        version: '1.0.0',
        modelType: ModelType.OBJECT_DETECTION,
        framework: 'invalid_framework',
        downloadUrl: 'https://example.com/model.tflite',
        capabilities: [ModelCapability.AD_DETECTION],
      };

      await modelController.installModel(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid framework',
        validValues: Object.values(MLFramework),
      });
    });

    it('should validate capabilities array', async () => {
      mockRequest.body = {
        name: 'test-model',
        version: '1.0.0',
        modelType: ModelType.OBJECT_DETECTION,
        framework: MLFramework.TENSORFLOW,
        downloadUrl: 'https://example.com/model.tflite',
        capabilities: [],
      };

      await modelController.installModel(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Capabilities must be a non-empty array',
        validValues: Object.values(ModelCapability),
      });
    });

    it('should handle installation failure', async () => {
      mockRequest.body = {
        name: 'test-model',
        version: '1.0.0',
        modelType: ModelType.OBJECT_DETECTION,
        framework: MLFramework.TENSORFLOW,
        downloadUrl: 'https://example.com/model.tflite',
        capabilities: [ModelCapability.AD_DETECTION],
      };

      mockModelService.installModel.mockResolvedValue({
        success: false,
        error: 'Download failed',
        details: { error: 'Network timeout' },
        metadata: {
          installTime: new Date(),
          downloadSize: 0,
          validationPassed: false,
          overwritten: false,
        },
      });

      await modelController.installModel(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Download failed',
        details: { error: 'Network timeout' },
        metadata: expect.any(Object),
      });
    });
  });

  describe('uninstallModel()', () => {
    it('should successfully uninstall a model', async () => {
      mockRequest.params = { id: 'model-123' };
      mockRequest.body = { keepFiles: false };

      mockModelService.uninstallModel.mockResolvedValue(true);

      await modelController.uninstallModel(mockRequest as Request, mockResponse as Response);

      expect(mockModelService.uninstallModel).toHaveBeenCalledWith('model-123', { keepFiles: false });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Model uninstalled successfully',
        data: { modelId: 'model-123', filesRemoved: true },
      });
    });

    it('should handle model not found', async () => {
      mockRequest.params = { id: 'nonexistent' };
      mockRequest.body = {};

      mockModelService.uninstallModel.mockRejectedValue(
        new ValidationError('Model not found', { modelId: 'nonexistent' })
      );

      await modelController.uninstallModel(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Model not found',
        details: { modelId: 'nonexistent' },
      });
    });
  });

  describe('listModels()', () => {
    it('should list models with filters', async () => {
      mockRequest.query = {
        modelType: ModelType.OBJECT_DETECTION,
        framework: MLFramework.TENSORFLOW,
        limit: '10',
        offset: '0',
      };

      const mockModels = [mockModelData];
      mockModelService.listModels.mockResolvedValue(mockModels);

      await modelController.listModels(mockRequest as Request, mockResponse as Response);

      expect(mockModelService.listModels).toHaveBeenCalledWith({
        modelType: ModelType.OBJECT_DETECTION,
        framework: MLFramework.TENSORFLOW,
        limit: 10,
        offset: 0,
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          models: mockModels,
          count: 1,
          filter: expect.any(Object),
        },
      });
    });

    it('should handle array query parameters', async () => {
      mockRequest.query = {
        capabilities: [ModelCapability.AD_DETECTION, ModelCapability.LOGO_RECOGNITION],
        tags: ['tag1', 'tag2'],
      };

      mockModelService.listModels.mockResolvedValue([]);

      await modelController.listModels(mockRequest as Request, mockResponse as Response);

      expect(mockModelService.listModels).toHaveBeenCalledWith({
        capabilities: [ModelCapability.AD_DETECTION, ModelCapability.LOGO_RECOGNITION],
        tags: ['tag1', 'tag2'],
      });
    });
  });

  describe('getModel()', () => {
    it('should return model by ID', async () => {
      mockRequest.params = { id: 'model-123' };
      mockModelService.getModel.mockResolvedValue(mockModelData);

      await modelController.getModel(mockRequest as Request, mockResponse as Response);

      expect(mockModelService.getModel).toHaveBeenCalledWith('model-123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { model: mockModelData },
      });
    });

    it('should return 404 for nonexistent model', async () => {
      mockRequest.params = { id: 'nonexistent' };
      mockModelService.getModel.mockResolvedValue(null);

      await modelController.getModel(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Model not found',
      });
    });
  });

  describe('searchModels()', () => {
    it('should search models by query', async () => {
      mockRequest.query = { q: 'test search' };
      mockModelService.searchModels.mockResolvedValue([mockModelData]);

      await modelController.searchModels(mockRequest as Request, mockResponse as Response);

      expect(mockModelService.searchModels).toHaveBeenCalledWith('test search');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          models: [mockModelData],
          count: 1,
          query: 'test search',
        },
      });
    });

    it('should validate query parameter', async () => {
      mockRequest.query = {}; // Missing query

      await modelController.searchModels(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Query parameter "q" is required',
      });
    });
  });

  describe('getModelsByCapability()', () => {
    it('should return models by capability', async () => {
      mockRequest.params = { capability: ModelCapability.AD_DETECTION };
      mockModelService.getModelsByCapability.mockResolvedValue([mockModelData]);

      await modelController.getModelsByCapability(mockRequest as Request, mockResponse as Response);

      expect(mockModelService.getModelsByCapability).toHaveBeenCalledWith(ModelCapability.AD_DETECTION);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          models: [mockModelData],
          count: 1,
          capability: ModelCapability.AD_DETECTION,
        },
      });
    });

    it('should validate capability parameter', async () => {
      mockRequest.params = { capability: 'invalid_capability' };

      await modelController.getModelsByCapability(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid capability',
        validValues: Object.values(ModelCapability),
      });
    });
  });

  describe('updateModel()', () => {
    it('should update model metadata', async () => {
      mockRequest.params = { id: 'model-123' };
      mockRequest.body = { description: 'Updated description' };

      const updatedModel = { ...mockModelData, description: 'Updated description' };
      mockModelService.updateModel.mockResolvedValue(updatedModel);

      await modelController.updateModel(mockRequest as Request, mockResponse as Response);

      expect(mockModelService.updateModel).toHaveBeenCalledWith('model-123', {
        description: 'Updated description',
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Model updated successfully',
        data: { model: updatedModel },
      });
    });

    it('should validate update data', async () => {
      mockRequest.params = { id: 'model-123' };
      mockRequest.body = {}; // Empty update data

      await modelController.updateModel(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'No update data provided',
      });
    });
  });

  describe('validateModel()', () => {
    it('should validate existing model', async () => {
      mockRequest.params = { id: 'model-123' };

      const validationResult = {
        isValid: true,
        errors: [],
        warnings: [],
        metadata: expect.any(Object),
      };
      mockModelService.validateExistingModel.mockResolvedValue(validationResult);

      await modelController.validateModel(mockRequest as Request, mockResponse as Response);

      expect(mockModelService.validateExistingModel).toHaveBeenCalledWith('model-123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          modelId: 'model-123',
          validation: validationResult,
        },
      });
    });
  });

  describe('getModelStatistics()', () => {
    it('should return model statistics', async () => {
      const mockStats = {
        totalModels: 5,
        modelsByType: { [ModelType.OBJECT_DETECTION]: 3 },
        modelsByFramework: { [MLFramework.TENSORFLOW]: 3 },
        totalStorageUsed: 10 * 1024 * 1024,
        averageFileSize: 2 * 1024 * 1024,
      };

      mockModelService.getModelStatistics.mockResolvedValue(mockStats);

      await modelController.getModelStatistics(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { statistics: mockStats },
      });
    });
  });

  describe('checkCompatibility()', () => {
    it('should check model platform compatibility', async () => {
      mockRequest.params = { id: 'model-123' };
      mockRequest.body = { platform: 'android' };

      const compatibilityResult = {
        compatible: true,
        platform: 'android',
        framework: 'tensorflow',
        version: '1.0.0',
        issues: [],
      };
      mockModelService.checkModelCompatibility.mockResolvedValue(compatibilityResult);

      await modelController.checkCompatibility(mockRequest as Request, mockResponse as Response);

      expect(mockModelService.checkModelCompatibility).toHaveBeenCalledWith('model-123', 'android');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          modelId: 'model-123',
          compatibility: compatibilityResult,
        },
      });
    });

    it('should validate platform parameter', async () => {
      mockRequest.params = { id: 'model-123' };
      mockRequest.body = {}; // Missing platform

      await modelController.checkCompatibility(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Platform is required',
      });
    });
  });

  describe('Error handling', () => {
    it('should handle internal server errors', async () => {
      mockRequest.query = {};
      mockModelService.listModels.mockRejectedValue(new Error('Database connection failed'));

      // Suppress console.error for this test
      jest.spyOn(console, 'error').mockImplementation(() => {});

      await modelController.listModels(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'Database connection failed',
      });

      (console.error as jest.Mock).mockRestore();
    });
  });
});
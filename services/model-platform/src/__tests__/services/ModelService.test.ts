import { ModelService } from '@/services/ModelService';
import { IModelDownloader } from '@/interfaces/IModelDownloader';
import { IModelValidator, ModelFormat } from '@/interfaces/IModelValidator';
import { IModelRepository, ModelType, MLFramework, ModelCapability } from '@/interfaces/IModelRepository';
import { ModelInstallRequest } from '@/interfaces/IModelService';
import * as fs from 'fs/promises';

/**
 * Model Service Unit Tests
 * 
 * Tests the high-level model management orchestration service
 * Following TDD approach with comprehensive mocking
 */

// Mock fs module
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ModelService', () => {
  let modelService: ModelService;
  let mockDownloader: jest.Mocked<IModelDownloader>;
  let mockValidator: jest.Mocked<IModelValidator>;
  let mockRepository: jest.Mocked<IModelRepository>;

  const mockModelData = {
    name: 'test-model',
    version: '1.0.0',
    description: 'Test model for unit testing',
    modelType: ModelType.OBJECT_DETECTION,
    framework: MLFramework.TENSORFLOW,
    downloadUrl: 'https://example.com/test-model.tflite',
    fileSize: 1024 * 1024, // 1MB
    checksum: 'a'.repeat(64),
    tags: ['test', 'detection'],
    capabilities: [ModelCapability.AD_DETECTION],
  };

  beforeEach(() => {
    // Create mock implementations
    mockDownloader = {
      downloadModel: jest.fn(),
      downloadBatch: jest.fn(),
      resumeDownload: jest.fn(),
      pauseDownload: jest.fn(),
      cancelDownload: jest.fn(),
      getDownloadProgress: jest.fn(),
      listActiveDownloads: jest.fn(),
      setMaxConcurrentDownloads: jest.fn(),
      cleanupTasks: jest.fn(),
      getActiveTasks: jest.fn(),
      verifyDownload: jest.fn(),
      getDownloadStats: jest.fn(),
    } as jest.Mocked<IModelDownloader>;

    mockValidator = {
      validateModel: jest.fn(),
      validateMetadata: jest.fn(),
      checkCompatibility: jest.fn(),
      detectModelFormat: jest.fn(),
      getSupportedFormats: jest.fn(),
      isValidModelArchive: jest.fn(),
      verifyChecksum: jest.fn(),
      scanForSecurity: jest.fn(),
      validateLoadable: jest.fn(),
      validateSignature: jest.fn(),
      extractMetadata: jest.fn(),
    } as jest.Mocked<IModelValidator>;

    mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByNameAndVersion: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
      findByCapability: jest.fn(),
      findLatestVersions: jest.fn(),
      search: jest.fn(),
    } as jest.Mocked<IModelRepository>;

    modelService = new ModelService(mockDownloader, mockValidator, mockRepository);
    
    // Setup common fs mocks
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
  });

  describe('installModel()', () => {
    const mockInstallRequest: ModelInstallRequest = {
      modelData: mockModelData,
      options: {
        skipValidation: false,
        overwrite: false,
      },
    };

    it('should successfully install a new model', async () => {
      // Setup mocks
      mockRepository.findByNameAndVersion.mockResolvedValue(null); // Model doesn't exist
      mockDownloader.downloadModel.mockResolvedValue({
        success: true,
        filePath: '/models/test-model_v1.0.0.tflite',
        fileSize: 1024 * 1024,
        checksum: 'a'.repeat(64),
      });
      mockValidator.validateModel.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        metadata: {
          format: ModelFormat.TENSORFLOW_LITE,
          framework: 'tensorflow',
          version: '1.0.0',
          modelSize: 1024 * 1024,
        },
      });
      mockRepository.create.mockResolvedValue({
        id: 'model-123',
        ...mockModelData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Execute
      const result = await modelService.installModel(mockInstallRequest);

      // Verify
      expect(result.success).toBe(true);
      expect(result.model).toBeDefined();
      expect(result.model?.id).toBe('model-123');
      expect(result.localPath).toContain('test-model_v1.0.0.tflite');
      expect(result.metadata.validationPassed).toBe(true);
      expect(result.metadata.overwritten).toBe(false);

      // Verify service interactions
      expect(mockRepository.findByNameAndVersion).toHaveBeenCalledWith('test-model', '1.0.0');
      expect(mockDownloader.downloadModel).toHaveBeenCalled();
      expect(mockValidator.validateModel).toHaveBeenCalled();
      expect(mockRepository.create).toHaveBeenCalled();
    });

    it('should skip validation when requested', async () => {
      const requestWithSkip = {
        ...mockInstallRequest,
        options: { ...mockInstallRequest.options, skipValidation: true },
      };

      mockRepository.findByNameAndVersion.mockResolvedValue(null);
      mockDownloader.downloadModel.mockResolvedValue({
        success: true,
        filePath: '/models/test-model_v1.0.0.tflite',
        fileSize: 1024 * 1024,
        checksum: 'a'.repeat(64),
      });
      mockRepository.create.mockResolvedValue({
        id: 'model-123',
        ...mockModelData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await modelService.installModel(requestWithSkip);

      expect(result.success).toBe(true);
      expect(mockValidator.validateModel).not.toHaveBeenCalled();
      expect(result.validationResult).toBeUndefined();
    });

    it('should fail when model already exists and overwrite is false', async () => {
      mockRepository.findByNameAndVersion.mockResolvedValue({
        id: 'existing-model',
        ...mockModelData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await modelService.installModel(mockInstallRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
      expect(mockDownloader.downloadModel).not.toHaveBeenCalled();
    });

    it('should overwrite existing model when requested', async () => {
      const requestWithOverwrite = {
        ...mockInstallRequest,
        options: { ...mockInstallRequest.options, overwrite: true },
      };

      const existingModel = {
        id: 'existing-model',
        ...mockModelData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findByNameAndVersion.mockResolvedValue(existingModel);
      mockDownloader.downloadModel.mockResolvedValue({
        success: true,
        filePath: '/models/test-model_v1.0.0.tflite',
        fileSize: 1024 * 1024,
        checksum: 'a'.repeat(64),
      });
      mockValidator.validateModel.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        metadata: {
          format: ModelFormat.TENSORFLOW_LITE,
          framework: 'tensorflow',
          version: '1.0.0',
          modelSize: 1024 * 1024,
        },
      });
      mockRepository.update.mockResolvedValue({
        ...existingModel,
        updatedAt: new Date(),
      });

      const result = await modelService.installModel(requestWithOverwrite);

      expect(result.success).toBe(true);
      expect(result.metadata.overwritten).toBe(true);
      expect(mockRepository.update).toHaveBeenCalledWith(
        'existing-model',
        expect.objectContaining({
          description: mockModelData.description,
          isValidated: true,
        })
      );
    });

    it('should fail on download error', async () => {
      mockRepository.findByNameAndVersion.mockResolvedValue(null);
      mockDownloader.downloadModel.mockResolvedValue({
        success: false,
        error: 'Network timeout',
      });

      const result = await modelService.installModel(mockInstallRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to download model');
      expect(mockValidator.validateModel).not.toHaveBeenCalled();
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('should fail on validation error', async () => {
      mockRepository.findByNameAndVersion.mockResolvedValue(null);
      mockDownloader.downloadModel.mockResolvedValue({
        success: true,
        filePath: '/models/test-model_v1.0.0.tflite',
        fileSize: 1024 * 1024,
        checksum: 'a'.repeat(64),
      });
      mockValidator.validateModel.mockResolvedValue({
        isValid: false,
        errors: [{
          code: 'INVALID_FORMAT',
          message: 'Invalid model format',
          severity: 'critical',
        }],
        warnings: [],
        metadata: {
          format: ModelFormat.UNKNOWN,
          framework: 'unknown',
          version: '1.0.0',
          modelSize: 1024 * 1024,
        },
      });

      const result = await modelService.installModel(mockInstallRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Model validation failed');
      expect(mockRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('uninstallModel()', () => {
    it('should successfully uninstall a model', async () => {
      mockRepository.findById.mockResolvedValue({
        id: 'model-123',
        ...mockModelData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockRepository.delete.mockResolvedValue(true);

      const result = await modelService.uninstallModel('model-123');

      expect(result).toBe(true);
      expect(mockRepository.findById).toHaveBeenCalledWith('model-123');
      expect(mockRepository.delete).toHaveBeenCalledWith('model-123');
    });

    it('should fail when model not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(modelService.uninstallModel('nonexistent')).rejects.toThrow('Model not found');
    });
  });

  describe('listModels()', () => {
    it('should return list of models with filter', async () => {
      const mockModels = [
        { id: '1', ...mockModelData, createdAt: new Date(), updatedAt: new Date() },
        { id: '2', ...mockModelData, name: 'another-model', createdAt: new Date(), updatedAt: new Date() },
      ];

      mockRepository.findAll.mockResolvedValue(mockModels);

      const filter = { modelType: ModelType.OBJECT_DETECTION };
      const result = await modelService.listModels(filter);

      expect(result).toEqual(mockModels);
      expect(mockRepository.findAll).toHaveBeenCalledWith(filter);
    });
  });

  describe('getModel()', () => {
    it('should return model by ID', async () => {
      const mockModel = {
        id: 'model-123',
        ...mockModelData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findById.mockResolvedValue(mockModel);

      const result = await modelService.getModel('model-123');

      expect(result).toEqual(mockModel);
      expect(mockRepository.findById).toHaveBeenCalledWith('model-123');
    });

    it('should return null for nonexistent model', async () => {
      mockRepository.findById.mockResolvedValue(null);

      const result = await modelService.getModel('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('searchModels()', () => {
    it('should search models by query', async () => {
      const mockModels = [
        { id: '1', ...mockModelData, createdAt: new Date(), updatedAt: new Date() },
      ];

      mockRepository.search.mockResolvedValue(mockModels);

      const result = await modelService.searchModels('test');

      expect(result).toEqual(mockModels);
      expect(mockRepository.search).toHaveBeenCalledWith('test');
    });
  });

  describe('getModelsByCapability()', () => {
    it('should return models by capability', async () => {
      const mockModels = [
        { id: '1', ...mockModelData, createdAt: new Date(), updatedAt: new Date() },
      ];

      mockRepository.findByCapability.mockResolvedValue(mockModels);

      const result = await modelService.getModelsByCapability(ModelCapability.AD_DETECTION);

      expect(result).toEqual(mockModels);
      expect(mockRepository.findByCapability).toHaveBeenCalledWith(ModelCapability.AD_DETECTION);
    });
  });

  describe('getLatestModels()', () => {
    it('should return latest model versions', async () => {
      const mockModels = [
        { id: '1', ...mockModelData, isLatest: true, createdAt: new Date(), updatedAt: new Date() },
      ];

      mockRepository.findLatestVersions.mockResolvedValue(mockModels);

      const result = await modelService.getLatestModels();

      expect(result).toEqual(mockModels);
      expect(mockRepository.findLatestVersions).toHaveBeenCalled();
    });
  });

  describe('updateModel()', () => {
    it('should update model metadata', async () => {
      const updateData = { description: 'Updated description' };
      const updatedModel = {
        id: 'model-123',
        ...mockModelData,
        description: 'Updated description',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.update.mockResolvedValue(updatedModel);

      const result = await modelService.updateModel('model-123', updateData);

      expect(result).toEqual(updatedModel);
      expect(mockRepository.update).toHaveBeenCalledWith('model-123', updateData);
    });
  });

  describe('validateExistingModel()', () => {
    it('should validate existing model file', async () => {
      const mockModel = {
        id: 'model-123',
        ...mockModelData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
        metadata: {
          format: ModelFormat.TENSORFLOW_LITE,
          framework: 'tensorflow',
          version: '1.0.0',
          modelSize: 1024 * 1024,
        },
      };

      mockRepository.findById.mockResolvedValue(mockModel);
      mockFs.access.mockResolvedValue(undefined); // Mock file exists
      mockValidator.validateModel.mockResolvedValue(mockValidationResult);

      const result = await modelService.validateExistingModel('model-123');

      expect(result).toEqual(mockValidationResult);
      expect(mockFs.access).toHaveBeenCalled();
      expect(mockValidator.validateModel).toHaveBeenCalled();
    });

    it('should fail when model not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(modelService.validateExistingModel('nonexistent')).rejects.toThrow('Model not found');
    });
  });

  describe('getModelStatistics()', () => {
    it('should calculate model statistics', async () => {
      const mockModels = [
        {
          id: '1',
          ...mockModelData,
          modelType: ModelType.OBJECT_DETECTION,
          framework: MLFramework.TENSORFLOW,
          fileSize: 1024 * 1024,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          ...mockModelData,
          name: 'another-model',
          modelType: ModelType.IMAGE_CLASSIFICATION,
          framework: MLFramework.PYTORCH,
          fileSize: 2 * 1024 * 1024,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockRepository.findAll.mockResolvedValue(mockModels);

      const result = await modelService.getModelStatistics();

      expect(result).toEqual({
        totalModels: 2,
        modelsByType: {
          [ModelType.OBJECT_DETECTION]: 1,
          [ModelType.IMAGE_CLASSIFICATION]: 1,
        },
        modelsByFramework: {
          [MLFramework.TENSORFLOW]: 1,
          [MLFramework.PYTORCH]: 1,
        },
        totalStorageUsed: 3 * 1024 * 1024,
        averageFileSize: Math.round((3 * 1024 * 1024) / 2),
      });
    });

    it('should handle empty model list', async () => {
      mockRepository.findAll.mockResolvedValue([]);

      const result = await modelService.getModelStatistics();

      expect(result).toEqual({
        totalModels: 0,
        modelsByType: {},
        modelsByFramework: {},
        totalStorageUsed: 0,
        averageFileSize: 0,
      });
    });
  });

  describe('checkModelCompatibility()', () => {
    it('should check model platform compatibility', async () => {
      const mockModel = {
        id: 'model-123',
        ...mockModelData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockCompatibilityResult = {
        compatible: true,
        platform: 'android',
        framework: 'tensorflow',
        version: '1.0.0',
        issues: [],
      };

      mockRepository.findById.mockResolvedValue(mockModel);
      mockValidator.checkCompatibility.mockResolvedValue(mockCompatibilityResult);

      const result = await modelService.checkModelCompatibility('model-123', 'android');

      expect(result).toEqual(mockCompatibilityResult);
      expect(mockValidator.checkCompatibility).toHaveBeenCalled();
    });
  });
});
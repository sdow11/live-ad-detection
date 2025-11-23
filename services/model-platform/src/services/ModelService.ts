import { IModelService, ModelInstallRequest, ModelInstallResult } from '@/interfaces/IModelService';
import { IModelDownloader } from '@/interfaces/IModelDownloader';
import { IModelValidator } from '@/interfaces/IModelValidator';
import { IModelRepository, ModelMetadata, ModelCreateData, ModelFilter } from '@/interfaces/IModelRepository';
import { ValidationError } from '@/utils/errors';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Model Service Implementation
 * 
 * Single Responsibility: High-level model operations orchestration
 * Open/Closed: Extensible for new operations via interfaces
 * Liskov Substitution: Depends on abstractions, not concrete implementations
 * Interface Segregation: Focused on model business logic
 * Dependency Inversion: Injected dependencies on abstractions
 */
export class ModelService {
  constructor(
    private readonly downloader: IModelDownloader,
    private readonly validator: IModelValidator,
    private readonly repository: IModelRepository
  ) {}

  /**
   * Install a new model by downloading, validating, and storing metadata
   */
  async installModel(request: ModelInstallRequest): Promise<ModelInstallResult> {
    const { modelData, options = {} } = request;
    const { skipValidation = false, overwrite = false } = options;

    try {
      // Check if model already exists
      const existingModel = await this.repository.findByNameAndVersion(
        modelData.name,
        modelData.version
      );

      if (existingModel && !overwrite) {
        throw new ValidationError(
          `Model ${modelData.name} version ${modelData.version} already exists`,
          { name: modelData.name, version: modelData.version }
        );
      }

      // Generate local storage path
      const fileName = this.generateFileName(modelData.name, modelData.version, modelData.downloadUrl);
      const localPath = path.join(options.storagePath || './models', fileName);

      // Ensure storage directory exists
      await fs.mkdir(path.dirname(localPath), { recursive: true });

      // Download the model
      const downloadResult = await this.downloader.downloadModel(
        modelData.downloadUrl,
        localPath,
        {
          retries: options.retries || 3,
          timeout: options.timeout || 300000,
        }
      );

      if (!downloadResult.success) {
        throw new ValidationError('Failed to download model', {
          downloadUrl: modelData.downloadUrl,
          error: downloadResult.error,
        });
      }

      // Validate the model if not skipped
      let validationResult;
      if (!skipValidation) {
        validationResult = await this.validator.validateModel(localPath, {
          strictMode: true,
          checkIntegrity: true,
          validateFormat: true,
          maxFileSize: options.maxFileSize,
        });

        if (!validationResult.isValid) {
          // Clean up downloaded file on validation failure
          await fs.unlink(localPath).catch(() => {}); // Ignore cleanup errors
          throw new ValidationError(
            'Model validation failed',
            {
              validationErrors: validationResult.errors,
              validationWarnings: validationResult.warnings,
            }
          );
        }
      }

      // Create model metadata for storage
      const createData: ModelCreateData = {
        name: modelData.name,
        version: modelData.version,
        description: modelData.description,
        modelType: modelData.modelType,
        framework: modelData.framework,
        downloadUrl: modelData.downloadUrl,
        fileSize: downloadResult.fileSize || 0,
        checksum: downloadResult.checksum || modelData.checksum,
        tags: modelData.tags || [],
        minFrameworkVersion: modelData.minFrameworkVersion,
        requiredGPU: modelData.requiredGPU || false,
        capabilities: modelData.capabilities,
      };

      // Store or update model metadata
      let storedModel: ModelMetadata;
      if (existingModel && overwrite) {
        const updatedModel = await this.repository.update(existingModel.id, {
          description: createData.description,
          downloadUrl: createData.downloadUrl,
          fileSize: createData.fileSize,
          checksum: createData.checksum,
          tags: createData.tags,
          minFrameworkVersion: createData.minFrameworkVersion,
          requiredGPU: createData.requiredGPU,
          capabilities: createData.capabilities,
          isValidated: !skipValidation,
        });

        if (!updatedModel) {
          throw new ValidationError('Failed to update existing model');
        }
        storedModel = updatedModel;
      } else {
        storedModel = await this.repository.create(createData);
      }

      return {
        success: true,
        model: storedModel,
        localPath: localPath,
        downloadResult: downloadResult,
        validationResult: validationResult,
        metadata: {
          installTime: new Date(),
          downloadSize: downloadResult.fileSize || 0,
          validationPassed: validationResult?.isValid ?? !skipValidation,
          overwritten: !!(existingModel && overwrite),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        details: error,
        metadata: {
          installTime: new Date(),
          downloadSize: 0,
          validationPassed: false,
          overwritten: false,
        },
      };
    }
  }

  /**
   * Uninstall a model by removing files and metadata
   */
  async uninstallModel(modelId: string, options?: { keepFiles?: boolean }): Promise<boolean> {
    try {
      const model = await this.repository.findById(modelId);
      if (!model) {
        throw new ValidationError('Model not found', { modelId });
      }

      // Remove from repository (soft delete)
      const deleted = await this.repository.delete(modelId);

      // Optionally remove files
      if (!options?.keepFiles && model.downloadUrl) {
        const fileName = this.generateFileName(
          model.name,
          model.version,
          model.downloadUrl
        );
        const localPath = path.join('./models', fileName);
        
        await fs.unlink(localPath).catch(() => {}); // Ignore file cleanup errors
      }

      return deleted;
    } catch (error: any) {
      throw new ValidationError(
        `Failed to uninstall model: ${error.message}`,
        { modelId }
      );
    }
  }

  /**
   * List models with optional filtering
   */
  async listModels(filter?: ModelFilter): Promise<ModelMetadata[]> {
    return this.repository.findAll(filter);
  }

  /**
   * Get model by ID
   */
  async getModel(modelId: string): Promise<ModelMetadata | null> {
    return this.repository.findById(modelId);
  }

  /**
   * Search models by query
   */
  async searchModels(query: string): Promise<ModelMetadata[]> {
    return this.repository.search(query);
  }

  /**
   * Get models by capability
   */
  async getModelsByCapability(capability: string): Promise<ModelMetadata[]> {
    return this.repository.findByCapability(capability as any);
  }

  /**
   * Get latest versions of all models
   */
  async getLatestModels(): Promise<ModelMetadata[]> {
    return this.repository.findLatestVersions();
  }

  /**
   * Update model metadata
   */
  async updateModel(modelId: string, updateData: Partial<ModelCreateData>): Promise<ModelMetadata | null> {
    return this.repository.update(modelId, updateData);
  }

  /**
   * Validate an existing model file
   */
  async validateExistingModel(modelId: string): Promise<any> {
    const model = await this.repository.findById(modelId);
    if (!model) {
      throw new ValidationError('Model not found', { modelId });
    }

    const fileName = this.generateFileName(model.name, model.version, model.downloadUrl);
    const localPath = path.join('./models', fileName);

    // Check if file exists
    try {
      await fs.access(localPath);
    } catch {
      throw new ValidationError('Model file not found on disk', {
        modelId,
        expectedPath: localPath,
      });
    }

    return this.validator.validateModel(localPath);
  }

  /**
   * Get model statistics
   */
  async getModelStatistics(): Promise<{
    totalModels: number;
    modelsByType: Record<string, number>;
    modelsByFramework: Record<string, number>;
    totalStorageUsed: number;
    averageFileSize: number;
  }> {
    const allModels = await this.repository.findAll();
    
    const stats = {
      totalModels: allModels.length,
      modelsByType: {} as Record<string, number>,
      modelsByFramework: {} as Record<string, number>,
      totalStorageUsed: 0,
      averageFileSize: 0,
    };

    for (const model of allModels) {
      // Count by type
      stats.modelsByType[model.modelType] = 
        (stats.modelsByType[model.modelType] || 0) + 1;

      // Count by framework
      stats.modelsByFramework[model.framework] = 
        (stats.modelsByFramework[model.framework] || 0) + 1;

      // Add to total storage
      stats.totalStorageUsed += model.fileSize;
    }

    stats.averageFileSize = stats.totalModels > 0 
      ? Math.round(stats.totalStorageUsed / stats.totalModels)
      : 0;

    return stats;
  }

  /**
   * Check model compatibility with a platform
   */
  async checkModelCompatibility(modelId: string, platform: string): Promise<{
    compatible: boolean;
    platform: string;
    requirements?: string[];
    warnings?: string[];
  }> {
    const model = await this.repository.findById(modelId);
    if (!model) {
      throw new ValidationError('Model not found', { modelId });
    }

    const fileName = this.generateFileName(model.name, model.version, model.downloadUrl);
    const localPath = path.join('./models', fileName);

    return this.validator.checkCompatibility(localPath, platform);
  }

  /**
   * Private helper methods
   */

  private generateFileName(name: string, version: string, downloadUrl: string): string {
    const extension = path.extname(downloadUrl) || '.bin';
    const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const safeVersion = version.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${safeName}_v${safeVersion}${extension}`;
  }
}
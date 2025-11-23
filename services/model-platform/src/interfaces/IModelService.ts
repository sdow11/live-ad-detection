/**
 * Model Service Interface
 * 
 * Defines the contract for high-level model management operations
 * Following Interface Segregation Principle - focused on business logic
 */

import { 
  ModelMetadata, 
  ModelFilter, 
  ModelCreateData, 
  ModelUpdateData,
  ModelType,
  ModelCapability 
} from './IModelRepository';
import { DownloadProgress, DownloadOptions } from './IModelDownloader';
import { ValidationResult } from './IModelValidator';

export interface ModelInstallRequest {
  modelData: ModelCreateData;
  options?: {
    skipValidation?: boolean;
    overwrite?: boolean;
    storagePath?: string;
    retries?: number;
    timeout?: number;
    maxFileSize?: number;
  };
}

export interface ModelInstallResult {
  success: boolean;
  model?: ModelMetadata;
  localPath?: string;
  downloadResult?: any;
  validationResult?: ValidationResult;
  error?: string;
  details?: any;
  metadata: {
    installTime: Date;
    downloadSize: number;
    validationPassed: boolean;
    overwritten: boolean;
  };
}

export interface LocalModelInfo {
  metadata: ModelMetadata;
  localPath: string;
  fileSize: number;
  lastAccessed: Date;
  installDate: Date;
  isValid: boolean;
  validationErrors?: string[];
}

export interface ModelStats {
  totalModels: number;
  installedModels: number;
  totalSize: number;
  byType: Record<ModelType, number>;
  byFramework: Record<string, number>;
  recentlyUsed: LocalModelInfo[];
  oldestModels: LocalModelInfo[];
}

export interface ModelHealthCheck {
  modelId: string;
  isHealthy: boolean;
  lastChecked: Date;
  issues?: string[];
  performance?: {
    loadTime: number;
    memoryUsage: number;
    inferenceTime?: number;
  };
}

/**
 * Model Service Interface
 * 
 * Single Responsibility: High-level model management business logic
 * Open/Closed: Extensible for new model operations
 * Dependency Inversion: Depends on repository, downloader, and validator abstractions
 */
export interface IModelService {
  /**
   * Install a model from registry or custom source
   */
  installModel(request: ModelInstallRequest): Promise<ModelInstallResult>;

  /**
   * Uninstall a model (removes local files)
   */
  uninstallModel(modelId: string): Promise<boolean>;

  /**
   * Get model metadata by ID
   */
  getModel(modelId: string): Promise<ModelMetadata | null>;

  /**
   * Get local model information
   */
  getLocalModel(modelId: string): Promise<LocalModelInfo | null>;

  /**
   * List all available models with filtering
   */
  listModels(filter?: ModelFilter): Promise<ModelMetadata[]>;

  /**
   * List locally installed models
   */
  listInstalledModels(): Promise<LocalModelInfo[]>;

  /**
   * Search models by capabilities and text query
   */
  searchModels(query: string, capabilities?: ModelCapability[]): Promise<ModelMetadata[]>;

  /**
   * Get models by capability
   */
  getModelsByCapability(capability: ModelCapability): Promise<ModelMetadata[]>;

  /**
   * Update model metadata
   */
  updateModel(modelId: string, updateData: ModelUpdateData): Promise<ModelMetadata | null>;

  /**
   * Check for model updates
   */
  checkForUpdates(modelId?: string): Promise<Array<{
    modelId: string;
    currentVersion: string;
    latestVersion: string;
    updateAvailable: boolean;
  }>>;

  /**
   * Update model to latest version
   */
  updateModelToLatest(modelId: string): Promise<ModelInstallResult>;

  /**
   * Validate installed model
   */
  validateInstalledModel(modelId: string): Promise<ValidationResult>;

  /**
   * Get model installation progress
   */
  getInstallProgress(modelId: string): Promise<DownloadProgress | null>;

  /**
   * Cancel model installation
   */
  cancelInstallation(modelId: string): Promise<boolean>;

  /**
   * Get model statistics
   */
  getModelStats(): Promise<ModelStats>;

  /**
   * Perform health check on models
   */
  performHealthCheck(modelId?: string): Promise<ModelHealthCheck[]>;

  /**
   * Clean up unused models and cache
   */
  cleanup(options?: {
    removeUnused?: boolean;
    maxAge?: number; // days
    maxSize?: number; // bytes
  }): Promise<{
    removedModels: number;
    freedSpace: number;
  }>;

  /**
   * Get model serving path (for inference endpoints)
   */
  getModelPath(modelId: string): Promise<string | null>;

  /**
   * Preload model for faster inference
   */
  preloadModel(modelId: string): Promise<boolean>;

  /**
   * Get model registry status
   */
  getRegistryStatus(): Promise<{
    available: boolean;
    totalModels: number;
    lastSyncTime?: Date;
    error?: string;
  }>;

  /**
   * Sync with model registry
   */
  syncWithRegistry(): Promise<{
    newModels: number;
    updatedModels: number;
    removedModels: number;
  }>;
}
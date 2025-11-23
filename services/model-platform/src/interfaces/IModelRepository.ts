/**
 * Model Repository Interface
 * 
 * Defines the contract for model data persistence operations
 * Following Interface Segregation Principle - focused on model data operations
 */

export interface ModelMetadata {
  id: string;
  name: string;
  version: string;
  description?: string;
  modelType: ModelType;
  framework: MLFramework;
  fileSize: number;
  checksum: string;
  downloadUrl: string;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  minFrameworkVersion?: string;
  requiredGPU?: boolean;
  capabilities: ModelCapability[];
  
  // Additional fields from entity
  downloadCount?: number;
  lastDownloadedAt?: Date;
  lastUsedAt?: Date;
  isActive?: boolean;
  isPublic?: boolean;
  isLatest?: boolean;
  parentModelId?: string;
  isValidated?: boolean;
  validatedAt?: Date;
  validationResults?: Record<string, any>;
  metadata?: Record<string, any>;
  
  // Entity methods
  getFormattedFileSize?(): string;
  isCompatibleWith?(platform: string): boolean;
  getAgeInDays?(): number;
  needsUpdate?(): boolean;
  recordUsage?(): void;
  toSummary?(): Record<string, any>;
  toDetail?(): Record<string, any>;
}

export enum ModelType {
  OBJECT_DETECTION = 'object_detection',
  IMAGE_CLASSIFICATION = 'image_classification',
  VIDEO_ANALYSIS = 'video_analysis',
  AUDIO_CLASSIFICATION = 'audio_classification',
}

export enum MLFramework {
  TENSORFLOW = 'tensorflow',
  PYTORCH = 'pytorch',
  ONNX = 'onnx',
  TENSORRT = 'tensorrt',
  OPENVINO = 'openvino',
}

export enum ModelCapability {
  AD_DETECTION = 'ad_detection',
  LOGO_RECOGNITION = 'logo_recognition',
  SCENE_CLASSIFICATION = 'scene_classification',
  AUDIO_AD_DETECTION = 'audio_ad_detection',
  TEXT_OVERLAY_DETECTION = 'text_overlay_detection',
}

export interface ModelFilter {
  modelType?: ModelType;
  framework?: MLFramework;
  capabilities?: ModelCapability[];
  tags?: string[];
  minFileSize?: number;
  maxFileSize?: number;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'version' | 'createdAt' | 'fileSize';
  sortOrder?: 'asc' | 'desc';
}

export interface ModelCreateData {
  name: string;
  version: string;
  description?: string;
  modelType: ModelType;
  framework: MLFramework;
  downloadUrl: string;
  fileSize: number;
  checksum: string;
  tags: string[];
  minFrameworkVersion?: string;
  requiredGPU?: boolean;
  capabilities: ModelCapability[];
}

export interface ModelUpdateData {
  description?: string;
  downloadUrl?: string;
  fileSize?: number;
  checksum?: string;
  tags?: string[];
  minFrameworkVersion?: string;
  requiredGPU?: boolean;
  capabilities?: ModelCapability[];
  isLatest?: boolean;
  isActive?: boolean;
  isPublic?: boolean;
  isValidated?: boolean;
}

/**
 * Model Repository Interface
 * 
 * Single Responsibility: Handle model metadata persistence
 * Interface Segregation: Only model data operations
 */
export interface IModelRepository {
  /**
   * Create a new model record
   */
  create(modelData: ModelCreateData): Promise<ModelMetadata>;

  /**
   * Find model by ID
   */
  findById(id: string): Promise<ModelMetadata | null>;

  /**
   * Find model by name and version
   */
  findByNameAndVersion(name: string, version: string): Promise<ModelMetadata | null>;

  /**
   * Find all models with optional filtering
   */
  findAll(filter?: ModelFilter): Promise<ModelMetadata[]>;

  /**
   * Update model metadata
   */
  update(id: string, updateData: ModelUpdateData): Promise<ModelMetadata | null>;

  /**
   * Delete model record (soft delete)
   */
  delete(id: string): Promise<boolean>;

  /**
   * Check if model exists
   */
  exists(id: string): Promise<boolean>;

  /**
   * Find models by capability
   */
  findByCapability(capability: ModelCapability): Promise<ModelMetadata[]>;

  /**
   * Find latest version of models by name
   */
  findLatestVersions(): Promise<ModelMetadata[]>;

  /**
   * Search models by text query
   */
  search(query: string): Promise<ModelMetadata[]>;
}
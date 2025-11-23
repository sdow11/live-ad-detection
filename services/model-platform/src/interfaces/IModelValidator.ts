/**
 * Model Validator Interface
 * 
 * Defines the contract for validating AI model files and metadata
 * Following Interface Segregation Principle - focused on validation operations
 */

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  metadata?: ModelFileMetadata;
}

export interface ValidationError {
  code: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  details?: any;
}

export interface ValidationWarning {
  code: string;
  message: string;
  recommendation?: string;
}

export interface ModelFileMetadata {
  format: ModelFormat;
  framework: string;
  version: string;
  inputShape?: number[];
  outputShape?: number[];
  layers?: number;
  parameters?: number;
  modelSize: number;
  supportedOps?: string[];
  requirements?: {
    minMemory?: number;
    minGPUMemory?: number;
    requiredLibraries?: string[];
  };
}

export enum ModelFormat {
  TENSORFLOW_SAVED_MODEL = 'tensorflow_saved_model',
  TENSORFLOW_LITE = 'tensorflow_lite',
  PYTORCH_STATE_DICT = 'pytorch_state_dict',
  PYTORCH_SCRIPT = 'pytorch_script',
  ONNX = 'onnx',
  TENSORRT = 'tensorrt',
  OPENVINO = 'openvino',
  COREML = 'coreml',
  UNKNOWN = 'unknown',
}

export interface ValidationOptions {
  checkIntegrity?: boolean;
  verifyChecksum?: boolean;
  validateFormat?: boolean;
  checkCompatibility?: boolean;
  strictMode?: boolean;
  maxFileSize?: number; // bytes
  allowedFormats?: ModelFormat[];
}

export interface CompatibilityCheck {
  platform: string;
  framework: string;
  version: string;
  compatible: boolean;
  issues?: string[];
}

/**
 * Model Validator Interface
 * 
 * Single Responsibility: Handle model validation and integrity checking
 * Interface Segregation: Only validation-related operations
 */
export interface IModelValidator {
  /**
   * Validate a model file
   */
  validateModel(filePath: string, options?: ValidationOptions): Promise<ValidationResult>;

  /**
   * Validate model metadata against actual file
   */
  validateMetadata(
    filePath: string,
    expectedMetadata: any,
    options?: ValidationOptions
  ): Promise<ValidationResult>;

  /**
   * Check file integrity using checksum
   */
  verifyChecksum(filePath: string, expectedChecksum: string): Promise<boolean>;

  /**
   * Detect model format from file
   */
  detectModelFormat(filePath: string): Promise<ModelFormat>;

  /**
   * Extract metadata from model file
   */
  extractMetadata(filePath: string): Promise<ModelFileMetadata>;

  /**
   * Check platform compatibility
   */
  checkCompatibility(
    filePath: string,
    targetPlatform: string,
    targetFramework?: string
  ): Promise<CompatibilityCheck>;

  /**
   * Validate model can be loaded successfully
   */
  validateLoadable(filePath: string, framework: string): Promise<ValidationResult>;

  /**
   * Perform security scan on model file
   */
  scanForSecurity(filePath: string): Promise<ValidationResult>;

  /**
   * Validate model signature/inputs/outputs
   */
  validateSignature(
    filePath: string,
    expectedInputs?: any[],
    expectedOutputs?: any[]
  ): Promise<ValidationResult>;

  /**
   * Get supported model formats
   */
  getSupportedFormats(): ModelFormat[];

  /**
   * Check if file is a valid model archive
   */
  isValidModelArchive(filePath: string): Promise<boolean>;
}
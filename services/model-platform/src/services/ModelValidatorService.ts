import fs from 'fs/promises';
import path from 'path';
import * as crypto from 'crypto';
import {
  IModelValidator,
  ValidationResult,
  ValidationError as IValidationError,
  ValidationWarning,
  ModelFileMetadata,
  ModelFormat,
  ValidationOptions,
  CompatibilityCheck,
} from '@/interfaces/IModelValidator';
import { ValidationError } from '@/utils/errors';

/**
 * Model Validator Service Implementation
 * 
 * Single Responsibility: Handle model file validation and integrity checking
 * Open/Closed: Extensible for new model formats and validation rules
 * Liskov Substitution: Implements IModelValidator contract
 * Interface Segregation: Only validation-related operations
 * Dependency Inversion: Depends on file system abstractions
 */
export class ModelValidatorService implements IModelValidator {
  private readonly supportedFormats: ModelFormat[] = [
    ModelFormat.TENSORFLOW_SAVED_MODEL,
    ModelFormat.TENSORFLOW_LITE,
    ModelFormat.PYTORCH_STATE_DICT,
    ModelFormat.PYTORCH_SCRIPT,
    ModelFormat.ONNX,
    ModelFormat.TENSORRT,
    ModelFormat.OPENVINO,
    ModelFormat.COREML,
  ];

  private readonly magicBytes: Record<string, ModelFormat> = {
    'TFL3': ModelFormat.TENSORFLOW_LITE,
    'PK\x03\x04': ModelFormat.PYTORCH_STATE_DICT, // ZIP format
    '\x08\x07': ModelFormat.ONNX, // ONNX protobuf
    '\x08\x01': ModelFormat.TENSORFLOW_SAVED_MODEL, // TensorFlow protobuf
  };

  private readonly suspiciousPatterns = [
    /import\s+os/g,
    /os\.system/g,
    /subprocess/g,
    /eval\s*\(/g,
    /exec\s*\(/g,
    /rm\s+-rf/g,
    /sudo/g,
    /__import__/g,
  ];

  /**
   * Validate a model file
   */
  async validateModel(filePath: string, options: ValidationOptions = {}): Promise<ValidationResult> {
    const errors: IValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let metadata: ModelFileMetadata | undefined;

    try {
      // Check if file exists and is accessible
      await this.validateFileAccess(filePath, errors);

      if (errors.length > 0 && options.strictMode) {
        return { isValid: false, errors, warnings };
      }

      // Get file stats
      const stats = await fs.stat(filePath);

      // Validate file size
      if (options.maxFileSize && stats.size > options.maxFileSize) {
        errors.push({
          code: 'FILE_TOO_LARGE',
          message: `File size ${stats.size} exceeds maximum allowed ${options.maxFileSize}`,
          severity: 'high',
          details: { actualSize: stats.size, maxSize: options.maxFileSize },
        });
      }

      // Extract metadata
      metadata = await this.extractMetadata(filePath);

      // Validate format if requested
      if (options.validateFormat !== false) {
        await this.validateModelFormat(metadata, options, errors, warnings);
      }

      // Verify checksum if requested
      if (options.verifyChecksum && options.checkIntegrity) {
        // Checksum verification would need expected checksum in options
        warnings.push({
          code: 'CHECKSUM_SKIPPED',
          message: 'Checksum verification requested but no expected checksum provided',
        });
      }

      // Check compatibility if platform specified
      if (options.checkCompatibility) {
        const compatibility = await this.checkCompatibility(filePath, 'generic');
        if (!compatibility.compatible) {
          errors.push({
            code: 'COMPATIBILITY_ISSUE',
            message: `Model may not be compatible: ${compatibility.issues?.join(', ')}`,
            severity: 'medium',
          });
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        metadata,
      };

    } catch (error) {
      errors.push({
        code: this.getErrorCodeFromError(error as Error),
        message: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'critical',
      });

      return {
        isValid: false,
        errors,
        warnings,
        metadata,
      };
    }
  }

  /**
   * Validate model metadata against actual file
   */
  async validateMetadata(
    filePath: string,
    expectedMetadata: any,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const errors: IValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      const actualMetadata = await this.extractMetadata(filePath);

      // Compare format
      if (expectedMetadata.format) {
        const expectedFormat = this.normalizeFormat(expectedMetadata.format);
        if (actualMetadata.format !== expectedFormat) {
          errors.push({
            code: 'FORMAT_MISMATCH',
            message: `Expected format ${expectedFormat}, got ${actualMetadata.format}`,
            severity: 'high',
            details: {
              expected: expectedFormat,
              actual: actualMetadata.format,
            },
          });
        }
      }

      // Compare file size
      if (expectedMetadata.modelSize) {
        const sizeTolerance = 1024; // 1KB tolerance
        const sizeDiff = Math.abs(actualMetadata.modelSize - expectedMetadata.modelSize);
        
        if (sizeDiff > sizeTolerance) {
          errors.push({
            code: 'SIZE_MISMATCH',
            message: `Size mismatch: expected ${expectedMetadata.modelSize}, got ${actualMetadata.modelSize}`,
            severity: 'medium',
            details: {
              expected: expectedMetadata.modelSize,
              actual: actualMetadata.modelSize,
              difference: sizeDiff,
            },
          });
        }
      }

      // Compare framework if specified
      if (expectedMetadata.framework && expectedMetadata.framework !== actualMetadata.framework) {
        warnings.push({
          code: 'FRAMEWORK_MISMATCH',
          message: `Framework mismatch: expected ${expectedMetadata.framework}, detected ${actualMetadata.framework}`,
        });
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        metadata: actualMetadata,
      };

    } catch (error) {
      return {
        isValid: false,
        errors: [{
          code: 'METADATA_EXTRACTION_FAILED',
          message: `Failed to extract metadata: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'critical',
        }],
        warnings,
      };
    }
  }

  /**
   * Check file integrity using checksum
   */
  async verifyChecksum(filePath: string, expectedChecksum: string): Promise<boolean> {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const hash = crypto.createHash('sha256');
      hash.update(fileBuffer);
      const actualChecksum = hash.digest('hex');
      
      return actualChecksum.toLowerCase() === expectedChecksum.toLowerCase();
    } catch (error) {
      throw new ValidationError(
        `Checksum verification failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Detect model format from file
   */
  async detectModelFormat(filePath: string): Promise<ModelFormat> {
    try {
      const stats = await fs.stat(filePath);

      // Check if it's a directory (TensorFlow SavedModel)
      if (stats.isDirectory()) {
        const files = await fs.readdir(filePath);
        if (files.includes('saved_model.pb') && files.includes('variables')) {
          return ModelFormat.TENSORFLOW_SAVED_MODEL;
        }
      }

      // Check magic bytes for files
      if (stats.isFile()) {
        const buffer = await fs.readFile(filePath, { encoding: null });
        
        // Check magic bytes
        for (const [magic, format] of Object.entries(this.magicBytes)) {
          if (buffer.subarray(0, magic.length).equals(Buffer.from(magic, 'binary'))) {
            return format;
          }
        }

        // Fallback to extension-based detection
        return this.detectFormatByExtension(filePath);
      }

      return ModelFormat.UNKNOWN;
    } catch (error) {
      return ModelFormat.UNKNOWN;
    }
  }

  /**
   * Extract metadata from model file
   */
  async extractMetadata(filePath: string): Promise<ModelFileMetadata> {
    const stats = await fs.stat(filePath);
    const format = await this.detectModelFormat(filePath);
    
    const metadata: ModelFileMetadata = {
      format,
      framework: this.getFrameworkFromFormat(format),
      version: 'unknown',
      modelSize: stats.size,
    };

    // Extract format-specific metadata
    switch (format) {
      case ModelFormat.TENSORFLOW_LITE:
        metadata.parameters = this.estimateParametersFromSize(stats.size, 'tflite');
        metadata.requirements = { minMemory: stats.size * 2 };
        break;

      case ModelFormat.ONNX:
        metadata.parameters = this.estimateParametersFromSize(stats.size, 'onnx');
        metadata.requirements = { minMemory: stats.size * 3 };
        break;

      case ModelFormat.PYTORCH_STATE_DICT:
        metadata.parameters = this.estimateParametersFromSize(stats.size, 'pytorch');
        metadata.requirements = { 
          minMemory: stats.size * 4,
          requiredLibraries: ['torch', 'torchvision'],
        };
        break;

      default:
        metadata.parameters = this.estimateParametersFromSize(stats.size, 'generic');
        break;
    }

    return metadata;
  }

  /**
   * Check platform compatibility
   */
  async checkCompatibility(
    filePath: string,
    targetPlatform: string,
    targetFramework?: string
  ): Promise<CompatibilityCheck> {
    try {
      const format = await this.detectModelFormat(filePath);
      const metadata = await this.extractMetadata(filePath);

      const compatibility: CompatibilityCheck = {
        platform: targetPlatform,
        framework: targetFramework || this.getFrameworkFromFormat(format),
        version: 'unknown',
        compatible: true,
        issues: [],
      };

      // Platform-specific compatibility checks
      switch (targetPlatform.toLowerCase()) {
        case 'android':
          compatibility.compatible = this.checkAndroidCompatibility(format, metadata, compatibility);
          break;

        case 'raspberry-pi':
        case 'raspberrypi':
          compatibility.compatible = this.checkRaspberryPiCompatibility(format, metadata, compatibility);
          break;

        case 'ios':
          compatibility.compatible = this.checkIOSCompatibility(format, metadata, compatibility);
          break;

        default:
          // Generic platform - most formats should work
          compatibility.compatible = format !== ModelFormat.UNKNOWN;
          if (!compatibility.compatible) {
            compatibility.issues?.push('Unknown model format');
          }
      }

      return compatibility;
    } catch (error) {
      return {
        platform: targetPlatform,
        framework: targetFramework || 'unknown',
        version: 'unknown',
        compatible: false,
        issues: [`Compatibility check failed: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  /**
   * Validate model can be loaded successfully
   */
  async validateLoadable(filePath: string, framework: string): Promise<ValidationResult> {
    const errors: IValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      const format = await this.detectModelFormat(filePath);
      const expectedFramework = this.getFrameworkFromFormat(format);

      if (framework.toLowerCase() !== expectedFramework.toLowerCase()) {
        warnings.push({
          code: 'FRAMEWORK_MISMATCH',
          message: `Model format ${format} may not be compatible with ${framework}`,
          recommendation: `Use ${expectedFramework} framework instead`,
        });
      }

      // Basic structural validation
      const buffer = await fs.readFile(filePath);
      
      if (buffer.length === 0) {
        errors.push({
          code: 'EMPTY_FILE',
          message: 'Model file is empty',
          severity: 'critical',
        });
      }

      // Check for obvious corruption
      if (this.isFileCorrupted(buffer)) {
        errors.push({
          code: 'FILE_CORRUPTED',
          message: 'Model file appears to be corrupted',
          severity: 'critical',
        });
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };

    } catch (error) {
      return {
        isValid: false,
        errors: [{
          code: 'LOADABILITY_CHECK_FAILED',
          message: `Loadability validation failed: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'critical',
        }],
        warnings,
      };
    }
  }

  /**
   * Perform security scan on model file
   */
  async scanForSecurity(filePath: string): Promise<ValidationResult> {
    const errors: IValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      const stats = await fs.stat(filePath);
      
      // Check for unusually large files (potential data exfiltration)
      if (stats.size > 5 * 1024 * 1024 * 1024) { // 5GB
        warnings.push({
          code: 'UNUSUALLY_LARGE',
          message: 'Model file is unusually large',
          recommendation: 'Verify this is expected for your model',
        });
      }

      // Read file content for pattern scanning
      const content = await fs.readFile(filePath, 'utf8').catch(() => 
        // If UTF8 fails, read as binary and convert parts to string
        fs.readFile(filePath).then(buf => buf.toString('binary'))
      );

      // Scan for suspicious patterns
      for (const pattern of this.suspiciousPatterns) {
        if (pattern.test(content)) {
          errors.push({
            code: 'SUSPICIOUS_CONTENT',
            message: `Detected suspicious pattern: ${pattern.source}`,
            severity: 'high',
            details: { pattern: pattern.source },
          });
        }
      }

      // Check for embedded executables or scripts
      if (content.includes('#!/bin/') || content.includes('MZ')) {
        errors.push({
          code: 'EMBEDDED_EXECUTABLE',
          message: 'Model file contains embedded executable code',
          severity: 'critical',
        });
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };

    } catch (error) {
      return {
        isValid: false,
        errors: [{
          code: 'SECURITY_SCAN_FAILED',
          message: `Security scan failed: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'medium',
        }],
        warnings,
      };
    }
  }

  /**
   * Validate model signature/inputs/outputs
   */
  async validateSignature(
    filePath: string,
    expectedInputs?: any[],
    expectedOutputs?: any[]
  ): Promise<ValidationResult> {
    const errors: IValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // This is a placeholder implementation
    // Real implementation would parse model files to extract signature info
    
    warnings.push({
      code: 'SIGNATURE_VALIDATION_PLACEHOLDER',
      message: 'Signature validation not yet implemented for this model format',
      recommendation: 'Implement format-specific signature extraction',
    });

    return {
      isValid: true,
      errors,
      warnings,
    };
  }

  /**
   * Get supported model formats
   */
  getSupportedFormats(): ModelFormat[] {
    return [...this.supportedFormats];
  }

  /**
   * Check if file is a valid model archive
   */
  async isValidModelArchive(filePath: string): Promise<boolean> {
    try {
      const buffer = await fs.readFile(filePath, { encoding: null });
      
      // Check for ZIP magic bytes (used by PyTorch, ONNX, etc.)
      if (buffer.subarray(0, 4).equals(Buffer.from('PK\x03\x04', 'binary'))) {
        return true;
      }

      // Check for TAR magic bytes
      if (buffer.subarray(257, 262).equals(Buffer.from('ustar', 'binary'))) {
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Private helper methods
   */

  private async validateFileAccess(filePath: string, errors: IValidationError[]): Promise<void> {
    try {
      await fs.access(filePath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        errors.push({
          code: 'FILE_NOT_FOUND',
          message: `Model file not found: ${filePath}`,
          severity: 'critical',
        });
      } else if (error.code === 'EACCES') {
        errors.push({
          code: 'PERMISSION_DENIED',
          message: `Permission denied accessing: ${filePath}`,
          severity: 'high',
        });
      } else if (error.code === 'ENOSPC') {
        errors.push({
          code: 'DISK_SPACE_ERROR',
          message: 'Insufficient disk space',
          severity: 'high',
        });
      } else {
        errors.push({
          code: 'FILE_READ_ERROR',
          message: `File access error: ${error.message}`,
          severity: 'high',
        });
      }
    }
  }

  private async validateModelFormat(
    metadata: ModelFileMetadata,
    options: ValidationOptions,
    errors: IValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    if (options.allowedFormats && !options.allowedFormats.includes(metadata.format)) {
      errors.push({
        code: 'UNSUPPORTED_FORMAT',
        message: `Model format ${metadata.format} is not in allowed formats`,
        severity: 'high',
        details: {
          detectedFormat: metadata.format,
          allowedFormats: options.allowedFormats,
        },
      });
    }

    if (metadata.format === ModelFormat.UNKNOWN) {
      if (options.strictMode) {
        errors.push({
          code: 'UNKNOWN_FORMAT',
          message: 'Unable to determine model format',
          severity: 'critical',
        });
      } else {
        warnings.push({
          code: 'UNKNOWN_FORMAT',
          message: 'Unable to determine model format',
          recommendation: 'Verify the model file is not corrupted',
        });
      }
    }
  }

  private detectFormatByExtension(filePath: string): ModelFormat {
    const ext = path.extname(filePath).toLowerCase();
    
    const extensionMap: Record<string, ModelFormat> = {
      '.tflite': ModelFormat.TENSORFLOW_LITE,
      '.onnx': ModelFormat.ONNX,
      '.pth': ModelFormat.PYTORCH_STATE_DICT,
      '.pt': ModelFormat.PYTORCH_STATE_DICT,
      '.torchscript': ModelFormat.PYTORCH_SCRIPT,
      '.pb': ModelFormat.TENSORFLOW_SAVED_MODEL,
      '.engine': ModelFormat.TENSORRT,
      '.xml': ModelFormat.OPENVINO,
      '.mlmodel': ModelFormat.COREML,
    };

    return extensionMap[ext] || ModelFormat.UNKNOWN;
  }

  private getFrameworkFromFormat(format: ModelFormat): string {
    const frameworkMap: Record<ModelFormat, string> = {
      [ModelFormat.TENSORFLOW_SAVED_MODEL]: 'tensorflow',
      [ModelFormat.TENSORFLOW_LITE]: 'tensorflow',
      [ModelFormat.PYTORCH_STATE_DICT]: 'pytorch',
      [ModelFormat.PYTORCH_SCRIPT]: 'pytorch',
      [ModelFormat.ONNX]: 'onnx',
      [ModelFormat.TENSORRT]: 'tensorrt',
      [ModelFormat.OPENVINO]: 'openvino',
      [ModelFormat.COREML]: 'coreml',
      [ModelFormat.UNKNOWN]: 'unknown',
    };

    return frameworkMap[format] || 'unknown';
  }

  private normalizeFormat(format: string): ModelFormat {
    const normalizedFormat = format.toLowerCase().replace(/[_-]/g, '');
    
    const formatMap: Record<string, ModelFormat> = {
      'tensorflow': ModelFormat.TENSORFLOW_SAVED_MODEL,
      'tensorflowsavedmodel': ModelFormat.TENSORFLOW_SAVED_MODEL,
      'tensorflowlite': ModelFormat.TENSORFLOW_LITE,
      'tflite': ModelFormat.TENSORFLOW_LITE,
      'pytorch': ModelFormat.PYTORCH_STATE_DICT,
      'pytorchstatedict': ModelFormat.PYTORCH_STATE_DICT,
      'onnx': ModelFormat.ONNX,
    };

    return formatMap[normalizedFormat] || ModelFormat.UNKNOWN;
  }

  private estimateParametersFromSize(sizeBytes: number, format: string): number {
    // Rough estimation based on typical model sizes
    // This is a simplified heuristic - real implementation would parse model metadata
    
    const bytesPerParameter: Record<string, number> = {
      'tflite': 4, // 32-bit floats typically quantized
      'onnx': 4,
      'pytorch': 4,
      'generic': 4,
    };

    const bpp = bytesPerParameter[format] || 4;
    return Math.round(sizeBytes / bpp);
  }

  private checkAndroidCompatibility(
    format: ModelFormat,
    metadata: ModelFileMetadata,
    compatibility: CompatibilityCheck
  ): boolean {
    switch (format) {
      case ModelFormat.TENSORFLOW_LITE:
        return true; // Native Android support
        
      case ModelFormat.ONNX:
        compatibility.issues?.push('ONNX may require additional runtime on Android');
        return true;
        
      case ModelFormat.PYTORCH_STATE_DICT:
        compatibility.issues?.push('PyTorch models may be large for mobile deployment');
        return metadata.modelSize < 100 * 1024 * 1024; // 100MB limit
        
      default:
        compatibility.issues?.push(`${format} is not optimized for Android`);
        return false;
    }
  }

  private checkRaspberryPiCompatibility(
    format: ModelFormat,
    metadata: ModelFileMetadata,
    compatibility: CompatibilityCheck
  ): boolean {
    // Raspberry Pi has limited resources
    if (metadata.modelSize > 500 * 1024 * 1024) { // 500MB
      compatibility.issues?.push('Model may be too large for Raspberry Pi memory');
      return false;
    }

    switch (format) {
      case ModelFormat.TENSORFLOW_LITE:
        return true; // Good for edge devices
        
      case ModelFormat.ONNX:
        compatibility.issues?.push('ONNX runtime may be resource-intensive');
        return metadata.modelSize < 200 * 1024 * 1024; // 200MB limit
        
      case ModelFormat.PYTORCH_STATE_DICT:
        compatibility.issues?.push('PyTorch may be too resource-intensive for Raspberry Pi');
        return false;
        
      default:
        compatibility.issues?.push(`${format} compatibility unknown for Raspberry Pi`);
        return false;
    }
  }

  private checkIOSCompatibility(
    format: ModelFormat,
    metadata: ModelFileMetadata,
    compatibility: CompatibilityCheck
  ): boolean {
    switch (format) {
      case ModelFormat.COREML:
        return true; // Native iOS support
        
      case ModelFormat.TENSORFLOW_LITE:
        return true; // Good mobile support
        
      case ModelFormat.ONNX:
        compatibility.issues?.push('ONNX may require additional setup on iOS');
        return true;
        
      default:
        compatibility.issues?.push(`${format} is not optimized for iOS`);
        return false;
    }
  }

  private isFileCorrupted(buffer: Buffer): boolean {
    // Basic corruption detection
    if (buffer.length === 0) return true;
    
    // Check for null bytes in suspicious places
    const nullByteRatio = buffer.filter(b => b === 0).length / buffer.length;
    if (nullByteRatio > 0.9) return true; // More than 90% null bytes
    
    return false;
  }

  private getErrorCodeFromError(error: Error): string {
    if (error.message.includes('ENOENT')) return 'FILE_NOT_FOUND';
    if (error.message.includes('EACCES')) return 'PERMISSION_DENIED';
    if (error.message.includes('ENOSPC')) return 'DISK_SPACE_ERROR';
    return 'VALIDATION_ERROR';
  }
}
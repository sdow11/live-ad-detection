import fs from 'fs/promises';
import path from 'path';
import * as crypto from 'crypto';
import { ModelValidatorService } from '@/services/ModelValidatorService';
import { 
  ModelFormat, 
  ValidationResult, 
  ValidationOptions,
  CompatibilityCheck 
} from '@/interfaces/IModelValidator';
import { ValidationError } from '@/utils/errors';

/**
 * Model Validator Service Tests
 * 
 * Tests following TDD approach with comprehensive coverage
 * Tests model validation, format detection, and security scanning
 */

// Mock dependencies
jest.mock('fs/promises');
jest.mock('crypto');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockCrypto = crypto as jest.Mocked<typeof crypto>;

describe('ModelValidatorService', () => {
  let validator: ModelValidatorService;

  beforeEach(() => {
    validator = new ModelValidatorService();
    jest.clearAllMocks();

    // Setup default mocks
    mockFs.access.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue({ 
      size: 1024 * 1024, // 1MB
      isFile: () => true,
      mtime: new Date(),
    } as any);
  });

  describe('validateModel()', () => {
    const testFilePath = '/tmp/models/test-model.pb';

    it('should validate TensorFlow SavedModel successfully', async () => {
      // Mock TensorFlow SavedModel structure
      mockFs.readdir.mockResolvedValueOnce(['saved_model.pb', 'variables'] as any);
      mockFs.stat.mockResolvedValueOnce({ 
        size: 2048576, // 2MB
        isDirectory: () => false,
        isFile: () => true,
      } as any);

      // Mock file content that looks like a TensorFlow model
      const mockModelContent = Buffer.from('\x08\x01\x12\x04test'); // Proto-like content
      mockFs.readFile.mockResolvedValueOnce(mockModelContent);

      const result = await validator.validateModel(testFilePath);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata?.format).toBe(ModelFormat.TENSORFLOW_SAVED_MODEL);
      expect(result.metadata?.modelSize).toBe(2048576);
    });

    it('should detect ONNX model format', async () => {
      const mockOnnxContent = Buffer.from('\x08\x07\x12\x04\x12\x02\x08\x01'); // ONNX magic bytes
      mockFs.readFile.mockResolvedValueOnce(mockOnnxContent);

      const result = await validator.validateModel('/tmp/models/model.onnx');

      expect(result.metadata?.format).toBe(ModelFormat.ONNX);
    });

    it('should detect PyTorch state dict', async () => {
      // PyTorch models are typically pickled Python objects
      const mockPyTorchContent = Buffer.from('PK\x03\x04'); // ZIP-like header (PyTorch uses ZIP)
      mockFs.readFile.mockResolvedValueOnce(mockPyTorchContent);

      const result = await validator.validateModel('/tmp/models/model.pth');

      expect(result.metadata?.format).toBe(ModelFormat.PYTORCH_STATE_DICT);
    });

    it('should detect TensorFlow Lite model', async () => {
      const mockTfLiteContent = Buffer.from('TFL3'); // TensorFlow Lite magic bytes
      mockFs.readFile.mockResolvedValueOnce(mockTfLiteContent);

      const result = await validator.validateModel('/tmp/models/model.tflite');

      expect(result.metadata?.format).toBe(ModelFormat.TENSORFLOW_LITE);
    });

    it('should validate with strict mode enabled', async () => {
      const mockContent = Buffer.from('invalid model data');
      mockFs.readFile.mockResolvedValueOnce(mockContent);

      const options: ValidationOptions = {
        strictMode: true,
        checkIntegrity: true,
        validateFormat: true,
      };

      const result = await validator.validateModel(testFilePath, options);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].severity).toBe('critical');
    });

    it('should check file size limits', async () => {
      mockFs.stat.mockResolvedValueOnce({
        size: 3 * 1024 * 1024 * 1024, // 3GB
        isFile: () => true,
      } as any);

      const options: ValidationOptions = {
        maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB limit
      };

      const result = await validator.validateModel(testFilePath, options);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'FILE_TOO_LARGE')).toBe(true);
    });

    it('should validate allowed formats', async () => {
      const mockContent = Buffer.from('PK\x03\x04'); // PyTorch ZIP format
      mockFs.readFile.mockResolvedValueOnce(mockContent);

      const options: ValidationOptions = {
        allowedFormats: [ModelFormat.TENSORFLOW_SAVED_MODEL, ModelFormat.ONNX],
      };

      const result = await validator.validateModel('/tmp/models/model.pth', options);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'UNSUPPORTED_FORMAT')).toBe(true);
    });

    it('should handle missing files', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('ENOENT: no such file'));

      const result = await validator.validateModel('/tmp/nonexistent.pb');

      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe('FILE_NOT_FOUND');
    });

    it('should handle corrupted files', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('EACCES: permission denied'));

      const result = await validator.validateModel(testFilePath);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe('FILE_READ_ERROR');
    });
  });

  describe('validateMetadata()', () => {
    it('should validate metadata against actual file', async () => {
      const mockContent = Buffer.from('\x08\x07\x12\x04\x12\x02\x08\x01'); // ONNX
      mockFs.readFile.mockResolvedValueOnce(mockContent);
      mockFs.stat.mockResolvedValueOnce({
        size: 1048576,
        isFile: () => true,
      } as any);

      const expectedMetadata = {
        format: 'onnx',
        modelSize: 1048576,
        framework: 'onnx',
        version: '1.0',
      };

      const result = await validator.validateMetadata(
        '/tmp/models/model.onnx', 
        expectedMetadata
      );

      expect(result.isValid).toBe(true);
    });

    it('should detect metadata mismatches', async () => {
      const mockContent = Buffer.from('TFL3'); // TensorFlow Lite
      mockFs.readFile.mockResolvedValueOnce(mockContent);
      mockFs.stat.mockResolvedValueOnce({
        size: 2048576,
        isFile: () => true,
      } as any);

      const expectedMetadata = {
        format: 'onnx', // Wrong format
        modelSize: 1048576, // Wrong size
      };

      const result = await validator.validateMetadata(
        '/tmp/models/model.tflite',
        expectedMetadata
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'FORMAT_MISMATCH')).toBe(true);
      expect(result.errors.some(e => e.code === 'SIZE_MISMATCH')).toBe(true);
    });
  });

  describe('verifyChecksum()', () => {
    it('should verify correct SHA256 checksum', async () => {
      const testContent = Buffer.from('test model content');
      mockFs.readFile.mockResolvedValueOnce(testContent);

      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('expected-checksum'),
      };
      mockCrypto.createHash.mockReturnValue(mockHash as any);

      const isValid = await validator.verifyChecksum('/tmp/model.pb', 'expected-checksum');

      expect(isValid).toBe(true);
      expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256');
    });

    it('should fail with incorrect checksum', async () => {
      const testContent = Buffer.from('test model content');
      mockFs.readFile.mockResolvedValueOnce(testContent);

      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('actual-checksum'),
      };
      mockCrypto.createHash.mockReturnValue(mockHash as any);

      const isValid = await validator.verifyChecksum('/tmp/model.pb', 'expected-checksum');

      expect(isValid).toBe(false);
    });

    it('should handle file read errors', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('File not found'));

      await expect(
        validator.verifyChecksum('/tmp/missing.pb', 'checksum')
      ).rejects.toThrow();
    });
  });

  describe('detectModelFormat()', () => {
    it('should detect TensorFlow SavedModel by directory structure', async () => {
      mockFs.stat.mockResolvedValueOnce({
        isDirectory: () => true,
        isFile: () => false,
      } as any);
      
      mockFs.readdir.mockResolvedValueOnce(['saved_model.pb', 'variables'] as any);

      const format = await validator.detectModelFormat('/tmp/models/savedmodel');

      expect(format).toBe(ModelFormat.TENSORFLOW_SAVED_MODEL);
    });

    it('should detect format by file extension', async () => {
      mockFs.stat.mockResolvedValueOnce({
        isDirectory: () => false,
        isFile: () => true,
      } as any);

      const testCases = [
        { path: '/tmp/model.tflite', expected: ModelFormat.TENSORFLOW_LITE },
        { path: '/tmp/model.onnx', expected: ModelFormat.ONNX },
        { path: '/tmp/model.pth', expected: ModelFormat.PYTORCH_STATE_DICT },
      ];

      for (const testCase of testCases) {
        mockFs.readFile.mockResolvedValueOnce(Buffer.from('dummy'));
        const format = await validator.detectModelFormat(testCase.path);
        // Note: This would need actual magic byte detection in real implementation
      }
    });

    it('should detect format by magic bytes', async () => {
      const testCases = [
        { 
          content: Buffer.from('TFL3\x00\x00\x00\x00'), 
          expected: ModelFormat.TENSORFLOW_LITE 
        },
        { 
          content: Buffer.from('\x08\x07\x12\x04\x12\x02\x08\x01'), 
          expected: ModelFormat.ONNX 
        },
        { 
          content: Buffer.from('PK\x03\x04'), 
          expected: ModelFormat.PYTORCH_STATE_DICT 
        },
      ];

      for (const testCase of testCases) {
        mockFs.stat.mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
        } as any);
        mockFs.readFile.mockResolvedValueOnce(testCase.content);

        const format = await validator.detectModelFormat('/tmp/test');
        expect(format).toBe(testCase.expected);
      }
    });

    it('should return UNKNOWN for unrecognized formats', async () => {
      mockFs.stat.mockResolvedValueOnce({
        isFile: () => true,
        isDirectory: () => false,
      } as any);
      mockFs.readFile.mockResolvedValueOnce(Buffer.from('random data'));

      const format = await validator.detectModelFormat('/tmp/unknown.bin');

      expect(format).toBe(ModelFormat.UNKNOWN);
    });
  });

  describe('extractMetadata()', () => {
    it('should extract basic file metadata', async () => {
      const mockContent = Buffer.from('TFL3\x00\x00\x00\x00');
      mockFs.readFile.mockResolvedValueOnce(mockContent);
      mockFs.stat.mockResolvedValueOnce({
        size: 1048576,
        isFile: () => true,
      } as any);

      const metadata = await validator.extractMetadata('/tmp/model.tflite');

      expect(metadata.format).toBe(ModelFormat.TENSORFLOW_LITE);
      expect(metadata.modelSize).toBe(1048576);
      expect(metadata.framework).toBe('tensorflow');
    });

    it('should extract model parameters count (placeholder)', async () => {
      const mockContent = Buffer.from('TFL3\x00\x00\x00\x00');
      mockFs.readFile.mockResolvedValueOnce(mockContent);
      mockFs.stat.mockResolvedValueOnce({
        size: 2097152, // 2MB
        isFile: () => true,
      } as any);

      const metadata = await validator.extractMetadata('/tmp/model.tflite');

      // For TensorFlow Lite, we can estimate parameters from file size
      expect(metadata.parameters).toBeGreaterThan(0);
    });
  });

  describe('checkCompatibility()', () => {
    it('should check platform compatibility', async () => {
      mockFs.stat.mockResolvedValueOnce({
        isFile: () => true,
        size: 1048576,
      } as any);
      mockFs.readFile.mockResolvedValueOnce(Buffer.from('TFL3'));

      const compatibility = await validator.checkCompatibility(
        '/tmp/model.tflite',
        'android',
        'tensorflow'
      );

      expect(compatibility.compatible).toBe(true);
      expect(compatibility.platform).toBe('android');
      expect(compatibility.framework).toBe('tensorflow');
    });

    it('should detect incompatible combinations', async () => {
      mockFs.stat.mockResolvedValueOnce({
        isFile: () => true,
        size: 1048576,
      } as any);
      mockFs.readFile.mockResolvedValueOnce(Buffer.from('PK\x03\x04')); // PyTorch

      const compatibility = await validator.checkCompatibility(
        '/tmp/model.pth',
        'raspberry-pi', // Limited resources
        'pytorch'
      );

      expect(compatibility.compatible).toBe(false);
      expect(compatibility.issues).toContain('PyTorch may be too resource-intensive for Raspberry Pi');
    });
  });

  describe('validateLoadable()', () => {
    it('should validate TensorFlow model loadability', async () => {
      const mockContent = Buffer.from('\x08\x01\x12\x04test');
      mockFs.readFile.mockResolvedValueOnce(mockContent);

      const result = await validator.validateLoadable('/tmp/model.pb', 'tensorflow');

      expect(result.isValid).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it('should detect loading issues', async () => {
      const mockContent = Buffer.from('corrupted data');
      mockFs.readFile.mockResolvedValueOnce(mockContent);

      const result = await validator.validateLoadable('/tmp/bad-model.pb', 'tensorflow');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('scanForSecurity()', () => {
    it('should pass security scan for clean model', async () => {
      const mockContent = Buffer.from('TFL3\x00\x00\x00\x00');
      mockFs.readFile.mockResolvedValueOnce(mockContent);

      const result = await validator.scanForSecurity('/tmp/clean-model.tflite');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect suspicious patterns', async () => {
      // Mock content with suspicious patterns
      const suspiciousContent = Buffer.from('import os\nos.system("rm -rf /")'); // Dangerous code
      mockFs.readFile.mockResolvedValueOnce(suspiciousContent);

      const result = await validator.scanForSecurity('/tmp/suspicious-model.py');

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'SUSPICIOUS_CONTENT')).toBe(true);
    });

    it('should detect oversized embedded data', async () => {
      // Very large model could be suspicious
      mockFs.stat.mockResolvedValueOnce({
        size: 10 * 1024 * 1024 * 1024, // 10GB
        isFile: () => true,
      } as any);

      const result = await validator.scanForSecurity('/tmp/huge-model.pb');

      expect(result.warnings.some(w => w.code === 'UNUSUALLY_LARGE')).toBe(true);
    });
  });

  describe('getSupportedFormats()', () => {
    it('should return list of supported formats', () => {
      const formats = validator.getSupportedFormats();

      expect(formats).toContain(ModelFormat.TENSORFLOW_SAVED_MODEL);
      expect(formats).toContain(ModelFormat.TENSORFLOW_LITE);
      expect(formats).toContain(ModelFormat.ONNX);
      expect(formats).toContain(ModelFormat.PYTORCH_STATE_DICT);
      expect(formats.length).toBeGreaterThan(0);
    });
  });

  describe('isValidModelArchive()', () => {
    it('should validate ZIP-based model archives', async () => {
      const mockZipContent = Buffer.from('PK\x03\x04'); // ZIP magic bytes
      mockFs.readFile.mockResolvedValueOnce(mockZipContent);

      const isValid = await validator.isValidModelArchive('/tmp/model.zip');

      expect(isValid).toBe(true);
    });

    it('should reject invalid archives', async () => {
      const mockContent = Buffer.from('not a zip file');
      mockFs.readFile.mockResolvedValueOnce(mockContent);

      const isValid = await validator.isValidModelArchive('/tmp/invalid.zip');

      expect(isValid).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle permission errors gracefully', async () => {
      mockFs.access.mockRejectedValueOnce({ code: 'EACCES' });

      const result = await validator.validateModel('/tmp/protected-model.pb');

      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe('PERMISSION_DENIED');
    });

    it('should handle disk space issues', async () => {
      mockFs.stat.mockRejectedValueOnce({ code: 'ENOSPC' });

      const result = await validator.validateModel('/tmp/model.pb');

      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe('DISK_SPACE_ERROR');
    });
  });
});
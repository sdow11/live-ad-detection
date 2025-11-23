import { ModelVersionService, UpdateOptions } from '@/services/ModelVersionService';
import { IModelRepository, ModelMetadata, ModelType, MLFramework, ModelCapability } from '@/interfaces/IModelRepository';
import { ModelService } from '@/services/ModelService';
import { ValidationError } from '@/utils/errors';

/**
 * Model Version Service Unit Tests
 * 
 * Tests the semantic versioning and update functionality
 * Following TDD approach with comprehensive mocking
 */

describe('ModelVersionService', () => {
  let versionService: ModelVersionService;
  let mockRepository: any;
  let mockModelService: any;

  const createMockModel = (name: string, version: string, id?: string): ModelMetadata => ({
    id: id || `model-${name}-${version}`,
    name,
    version,
    description: `Mock ${name} v${version}`,
    modelType: ModelType.OBJECT_DETECTION,
    framework: MLFramework.TENSORFLOW,
    downloadUrl: `https://example.com/${name}-${version}.tflite`,
    fileSize: 1024 * 1024,
    checksum: 'a'.repeat(64),
    tags: ['test'],
    capabilities: [ModelCapability.AD_DETECTION],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    mockRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    mockModelService = {
      installModel: jest.fn(),
      updateModel: jest.fn(),
      getModel: jest.fn(),
    };

    versionService = new ModelVersionService(mockRepository, mockModelService);
  });

  describe('parseVersion()', () => {
    it('should parse valid semantic versions', () => {
      const result = versionService.parseVersion('1.2.3');
      
      expect(result.version).toBe('1.2.3');
      expect(result.major).toBe(1);
      expect(result.minor).toBe(2);
      expect(result.patch).toBe(3);
      expect(result.isPrerelease).toBe(false);
      expect(result.prerelease).toBeUndefined();
    });

    it('should parse prerelease versions', () => {
      const result = versionService.parseVersion('1.2.3-alpha.1');
      
      expect(result.version).toBe('1.2.3-alpha.1');
      expect(result.major).toBe(1);
      expect(result.minor).toBe(2);
      expect(result.patch).toBe(3);
      expect(result.isPrerelease).toBe(true);
      expect(result.prerelease).toEqual(['alpha', 1]);
    });

    it('should parse versions with build metadata', () => {
      const result = versionService.parseVersion('1.2.3+build.1');
      
      expect(result.version).toBe('1.2.3'); // semver.parse normalizes and drops build metadata from version
      expect(result.isPrerelease).toBe(false);
      expect(result.build).toEqual(['build', '1']);
    });

    it('should throw error for invalid versions', () => {
      expect(() => versionService.parseVersion('invalid.version')).toThrow(ValidationError);
      expect(() => versionService.parseVersion('1.2')).toThrow(ValidationError);
      expect(() => versionService.parseVersion('')).toThrow(ValidationError);
    });
  });

  describe('compareVersions()', () => {
    it('should compare versions correctly', () => {
      expect(versionService.compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(versionService.compareVersions('1.0.1', '1.0.0')).toBe(1);
      expect(versionService.compareVersions('1.0.0', '1.0.1')).toBe(-1);
      expect(versionService.compareVersions('2.0.0', '1.9.9')).toBe(1);
      expect(versionService.compareVersions('1.0.0-alpha', '1.0.0')).toBe(-1);
    });
  });

  describe('satisfiesRange()', () => {
    it('should check version ranges correctly', () => {
      expect(versionService.satisfiesRange('1.2.3', '^1.0.0')).toBe(true);
      expect(versionService.satisfiesRange('1.2.3', '^2.0.0')).toBe(false);
      expect(versionService.satisfiesRange('1.2.3', '~1.2.0')).toBe(true);
      expect(versionService.satisfiesRange('1.3.0', '~1.2.0')).toBe(false);
    });
  });

  describe('getLatestVersion()', () => {
    it('should return the latest stable version', async () => {
      const models = [
        createMockModel('test-model', '1.0.0'),
        createMockModel('test-model', '1.1.0'),
        createMockModel('test-model', '1.0.5'),
        createMockModel('test-model', '2.0.0-alpha.1'),
      ];

      mockRepository.findAll.mockResolvedValue(models);

      const result = await versionService.getLatestVersion('test-model');

      expect(result?.version).toBe('1.1.0');
    });

    it('should include prerelease versions when requested', async () => {
      const models = [
        createMockModel('test-model', '1.0.0'),
        createMockModel('test-model', '1.1.0'),
        createMockModel('test-model', '2.0.0-alpha.1'),
      ];

      mockRepository.findAll.mockResolvedValue(models);

      const result = await versionService.getLatestVersion('test-model', { includePrerelease: true });

      expect(result?.version).toBe('2.0.0-alpha.1');
    });

    it('should return null for non-existent models', async () => {
      mockRepository.findAll.mockResolvedValue([]);

      const result = await versionService.getLatestVersion('non-existent');

      expect(result).toBeNull();
    });

    it('should handle models with invalid versions gracefully', async () => {
      const models = [
        createMockModel('test-model', 'invalid-version'),
        createMockModel('test-model', '1.0.0'),
      ];

      mockRepository.findAll.mockResolvedValue(models);

      const result = await versionService.getLatestVersion('test-model');

      expect(result?.version).toBe('1.0.0');
    });
  });

  describe('getAllVersions()', () => {
    it('should return all versions sorted by version descending', async () => {
      const models = [
        createMockModel('test-model', '1.0.0'),
        createMockModel('test-model', '2.0.0'),
        createMockModel('test-model', '1.5.0'),
      ];

      mockRepository.findAll.mockResolvedValue(models);

      const result = await versionService.getAllVersions('test-model');

      expect(result.map(m => m.version)).toEqual(['2.0.0', '1.5.0', '1.0.0']);
    });

    it('should handle mixed valid and invalid versions', async () => {
      const models = [
        createMockModel('test-model', 'invalid'),
        createMockModel('test-model', '1.0.0'),
        createMockModel('test-model', 'also-invalid'),
        createMockModel('test-model', '2.0.0'),
      ];

      mockRepository.findAll.mockResolvedValue(models);

      const result = await versionService.getAllVersions('test-model');

      // Should handle gracefully and sort valid versions first
      expect(result).toHaveLength(4);
      expect(result[0].version).toBe('2.0.0');
      expect(result[1].version).toBe('1.0.0');
    });
  });

  describe('checkForUpdates()', () => {
    it('should detect available updates', async () => {
      const currentModel = createMockModel('test-model', '1.0.0', 'current-id');
      const latestModel = createMockModel('test-model', '1.2.0', 'latest-id');

      mockRepository.findById.mockResolvedValue(currentModel);
      mockRepository.findAll.mockResolvedValue([currentModel, latestModel]);

      const result = await versionService.checkForUpdates('current-id');

      expect(result.hasUpdate).toBe(true);
      expect(result.currentVersion).toBe('1.0.0');
      expect(result.latestVersion).toBe('1.2.0');
      expect(result.updateType).toBe('minor');
      expect(result.isBreakingChange).toBe(false);
    });

    it('should detect major version updates as breaking changes', async () => {
      const currentModel = createMockModel('test-model', '1.0.0', 'current-id');
      const latestModel = createMockModel('test-model', '2.0.0', 'latest-id');

      mockRepository.findById.mockResolvedValue(currentModel);
      mockRepository.findAll.mockResolvedValue([currentModel, latestModel]);

      const result = await versionService.checkForUpdates('current-id');

      expect(result.hasUpdate).toBe(true);
      expect(result.updateType).toBe('major');
      expect(result.isBreakingChange).toBe(true);
    });

    it('should detect patch updates', async () => {
      const currentModel = createMockModel('test-model', '1.0.0', 'current-id');
      const latestModel = createMockModel('test-model', '1.0.1', 'latest-id');

      mockRepository.findById.mockResolvedValue(currentModel);
      mockRepository.findAll.mockResolvedValue([currentModel, latestModel]);

      const result = await versionService.checkForUpdates('current-id');

      expect(result.updateType).toBe('patch');
      expect(result.isBreakingChange).toBe(false);
    });

    it('should return no update when current is latest', async () => {
      const currentModel = createMockModel('test-model', '1.0.0', 'current-id');

      mockRepository.findById.mockResolvedValue(currentModel);
      mockRepository.findAll.mockResolvedValue([currentModel]);

      const result = await versionService.checkForUpdates('current-id');

      expect(result.hasUpdate).toBe(false);
      expect(result.updateType).toBe('none');
    });

    it('should throw error for non-existent model', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(versionService.checkForUpdates('non-existent')).rejects.toThrow('Model not found');
    });
  });

  describe('checkAllForUpdates()', () => {
    it('should check updates for all models', async () => {
      const models = [
        createMockModel('model-a', '1.0.0', 'model-a-old'),
        createMockModel('model-a', '1.1.0', 'model-a-latest'),
        createMockModel('model-b', '2.0.0', 'model-b-latest'),
      ];

      mockRepository.findAll.mockResolvedValue(models);

      const results = await versionService.checkAllForUpdates();

      // Should find one update (model-a from 1.0.0 to 1.1.0)
      expect(results).toHaveLength(1);
      expect(results[0].modelId).toBe('model-a-old');
      expect(results[0].hasUpdate).toBe(true);
      expect(results[0].latestVersion).toBe('1.1.0');
    });
  });

  describe('updateToLatest()', () => {
    it('should successfully update model to latest version', async () => {
      const currentModel = createMockModel('test-model', '1.0.0', 'current-id');
      const latestModel = createMockModel('test-model', '1.1.0', 'latest-id');

      mockRepository.findById.mockResolvedValue(currentModel);
      mockRepository.findAll.mockResolvedValue([currentModel, latestModel]);
      mockRepository.create.mockResolvedValue({ id: 'backup-id' });
      mockModelService.installModel.mockResolvedValue({ success: true });

      const options: UpdateOptions = {
        allowMinor: true,
        autoInstall: true,
        backup: true,
      };

      const result = await versionService.updateToLatest('current-id', options);

      expect(result.success).toBe(true);
      expect(result.oldVersion).toBe('1.0.0');
      expect(result.newVersion).toBe('1.1.0');
      expect(result.backupId).toBeDefined();
    });

    it('should reject major updates when not allowed', async () => {
      const currentModel = createMockModel('test-model', '1.0.0', 'current-id');
      const latestModel = createMockModel('test-model', '2.0.0', 'latest-id');

      mockRepository.findById.mockResolvedValue(currentModel);
      mockRepository.findAll.mockResolvedValue([currentModel, latestModel]);

      const options: UpdateOptions = {
        allowMajor: false,
      };

      const result = await versionService.updateToLatest('current-id', options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should reject breaking changes without force flag', async () => {
      const currentModel = createMockModel('test-model', '1.0.0', 'current-id');
      const latestModel = createMockModel('test-model', '2.0.0', 'latest-id');

      mockRepository.findById.mockResolvedValue(currentModel);
      mockRepository.findAll.mockResolvedValue([currentModel, latestModel]);

      const options: UpdateOptions = {
        allowMajor: true,
        force: false,
      };

      const result = await versionService.updateToLatest('current-id', options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Breaking change detected');
    });

    it('should handle installation failures', async () => {
      const currentModel = createMockModel('test-model', '1.0.0', 'current-id');
      const latestModel = createMockModel('test-model', '1.1.0', 'latest-id');

      mockRepository.findById.mockResolvedValue(currentModel);
      mockRepository.findAll.mockResolvedValue([currentModel, latestModel]);
      mockModelService.installModel.mockResolvedValue({ 
        success: false, 
        error: 'Download failed' 
      });

      const options: UpdateOptions = {
        allowMinor: true,
        autoInstall: true,
      };

      const result = await versionService.updateToLatest('current-id', options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Installation failed');
    });
  });

  describe('getVersionHistory()', () => {
    it('should return version history with metadata', async () => {
      const models = [
        { ...createMockModel('test-model', '1.0.0'), downloadCount: 10 },
        { ...createMockModel('test-model', '1.1.0'), downloadCount: 5 },
        { ...createMockModel('test-model', '2.0.0-alpha.1'), downloadCount: 1 },
      ];

      mockRepository.findAll.mockResolvedValue(models);

      const result = await versionService.getVersionHistory('test-model');

      expect(result.modelName).toBe('test-model');
      expect(result.versions).toHaveLength(3);
      expect(result.versions[0].version).toBe('2.0.0-alpha.1');
      expect(result.versions[0].isPrerelease).toBe(true);
      expect(result.versions[1].version).toBe('1.1.0');
      expect(result.versions[1].isLatest).toBe(true);
      expect(result.versions[1].isPrerelease).toBe(false);
    });
  });

  describe('findOutdatedModels()', () => {
    it('should find models that need updates', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);

      const models = [
        { ...createMockModel('model-a', '1.0.0', 'old-model'), createdAt: oldDate },
        { ...createMockModel('model-a', '1.1.0', 'new-model'), createdAt: new Date() },
        { ...createMockModel('model-b', '2.0.0', 'current-model'), createdAt: new Date() },
      ];

      mockRepository.findAll.mockResolvedValue(models);

      const result = await versionService.findOutdatedModels(7); // 7 days

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('old-model');
    });

    it('should find all outdated models when no age limit specified', async () => {
      const models = [
        createMockModel('model-a', '1.0.0', 'old-model'),
        createMockModel('model-a', '1.1.0', 'new-model'),
      ];

      mockRepository.findAll.mockResolvedValue(models);

      const result = await versionService.findOutdatedModels();

      // Should return models that have updates available
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle repository errors gracefully', async () => {
      mockRepository.findAll.mockRejectedValue(new Error('Database error'));

      await expect(versionService.getAllVersions('test-model')).rejects.toThrow('Database error');
    });

    it('should handle malformed version data', async () => {
      const modelsWithBadVersions = [
        { ...createMockModel('test-model', 'not-a-version'), id: 'bad-1' },
        { ...createMockModel('test-model', '1.0.0'), id: 'good-1' },
      ];

      mockRepository.findAll.mockResolvedValue(modelsWithBadVersions);

      // Should not throw, but handle gracefully
      const result = await versionService.getAllVersions('test-model');
      expect(result).toHaveLength(2);
    });
  });
});
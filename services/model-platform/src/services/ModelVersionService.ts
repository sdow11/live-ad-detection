import * as semver from 'semver';
import { IModelRepository, ModelMetadata, ModelFilter } from '@/interfaces/IModelRepository';
import { ModelService } from '@/services/ModelService';
import { ValidationError } from '@/utils/errors';

/**
 * Version Information Interface
 */
export interface VersionInfo {
  version: string;
  isPrerelease: boolean;
  major: number;
  minor: number;
  patch: number;
  prerelease?: readonly (string | number)[];
  build?: readonly string[];
}

/**
 * Update Check Result
 */
export interface UpdateCheckResult {
  modelId: string;
  modelName: string;
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  updateType: 'major' | 'minor' | 'patch' | 'prerelease' | 'none';
  isBreakingChange: boolean;
  releaseNotes?: string;
  downloadUrl?: string;
}

/**
 * Update Options
 */
export interface UpdateOptions {
  allowMajor?: boolean;
  allowMinor?: boolean;
  allowPatch?: boolean;
  allowPrerelease?: boolean;
  autoInstall?: boolean;
  backup?: boolean;
  force?: boolean;
}

/**
 * Model Version Service
 * 
 * Single Responsibility: Handle model versioning and updates
 * Open/Closed: Extensible for new version strategies
 * Liskov Substitution: Implements consistent version contracts
 * Interface Segregation: Focused on version operations
 * Dependency Inversion: Depends on repository and model service abstractions
 */
export class ModelVersionService {
  constructor(
    private readonly repository: IModelRepository,
    private readonly modelService: ModelService
  ) {}

  /**
   * Parse version string into structured information
   */
  parseVersion(versionString: string): VersionInfo {
    if (!semver.valid(versionString)) {
      throw new ValidationError(`Invalid version format: ${versionString}`);
    }

    const parsed = semver.parse(versionString);
    if (!parsed) {
      throw new ValidationError(`Failed to parse version: ${versionString}`);
    }

    return {
      version: parsed.version,
      isPrerelease: parsed.prerelease.length > 0,
      major: parsed.major,
      minor: parsed.minor,
      patch: parsed.patch,
      prerelease: parsed.prerelease.length > 0 ? parsed.prerelease : undefined,
      build: parsed.build.length > 0 ? parsed.build : undefined,
    };
  }

  /**
   * Compare two versions
   */
  compareVersions(version1: string, version2: string): number {
    return semver.compare(version1, version2);
  }

  /**
   * Check if version satisfies range
   */
  satisfiesRange(version: string, range: string): boolean {
    return semver.satisfies(version, range);
  }

  /**
   * Get the latest version of a model
   */
  async getLatestVersion(modelName: string, options?: {
    includePrerelease?: boolean;
  }): Promise<ModelMetadata | null> {
    const models = await this.repository.findAll({
      search: modelName,
    });

    const namedModels = models.filter(model => model.name === modelName);
    if (namedModels.length === 0) {
      return null;
    }

    // Sort by version descending
    const sortedModels = namedModels
      .filter(model => {
        if (!options?.includePrerelease) {
          try {
            const versionInfo = this.parseVersion(model.version);
            return !versionInfo.isPrerelease;
          } catch {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const aValid = semver.valid(a.version);
        const bValid = semver.valid(b.version);
        
        // Both valid: sort by semantic version
        if (aValid && bValid) {
          return this.compareVersions(b.version, a.version);
        }
        
        // Only a is valid: a comes first
        if (aValid && !bValid) {
          return -1;
        }
        
        // Only b is valid: b comes first
        if (!aValid && bValid) {
          return 1;
        }
        
        // Neither valid: sort alphabetically
        return b.version.localeCompare(a.version);
      });

    return sortedModels[0] || null;
  }

  /**
   * Get all versions of a model
   */
  async getAllVersions(modelName: string): Promise<ModelMetadata[]> {
    const models = await this.repository.findAll({
      search: modelName,
    });

    const namedModels = models.filter(model => model.name === modelName);

    // Sort by version descending, with valid versions first
    return namedModels.sort((a, b) => {
      const aValid = semver.valid(a.version);
      const bValid = semver.valid(b.version);
      
      // Both valid: sort by semantic version
      if (aValid && bValid) {
        return this.compareVersions(b.version, a.version);
      }
      
      // Only a is valid: a comes first
      if (aValid && !bValid) {
        return -1;
      }
      
      // Only b is valid: b comes first
      if (!aValid && bValid) {
        return 1;
      }
      
      // Neither valid: sort alphabetically
      return b.version.localeCompare(a.version);
    });
  }

  /**
   * Check for updates for a specific model
   */
  async checkForUpdates(modelId: string): Promise<UpdateCheckResult> {
    const currentModel = await this.repository.findById(modelId);
    if (!currentModel) {
      throw new ValidationError('Model not found', { modelId });
    }

    const latestModel = await this.getLatestVersion(currentModel.name);
    if (!latestModel) {
      throw new ValidationError('No versions found for model', { modelName: currentModel.name });
    }

    const hasUpdate = this.compareVersions(latestModel.version, currentModel.version) > 0;
    
    let updateType: 'major' | 'minor' | 'patch' | 'prerelease' | 'none' = 'none';
    let isBreakingChange = false;

    if (hasUpdate) {
      try {
        const currentVersionInfo = this.parseVersion(currentModel.version);
        const latestVersionInfo = this.parseVersion(latestModel.version);

        if (latestVersionInfo.major > currentVersionInfo.major) {
          updateType = 'major';
          isBreakingChange = true;
        } else if (latestVersionInfo.minor > currentVersionInfo.minor) {
          updateType = 'minor';
        } else if (latestVersionInfo.patch > currentVersionInfo.patch) {
          updateType = 'patch';
        } else if (latestVersionInfo.isPrerelease) {
          updateType = 'prerelease';
        }
      } catch {
        updateType = 'minor'; // Default if parsing fails
      }
    }

    return {
      modelId,
      modelName: currentModel.name,
      currentVersion: currentModel.version,
      latestVersion: latestModel.version,
      hasUpdate,
      updateType,
      isBreakingChange,
      downloadUrl: latestModel.downloadUrl,
    };
  }

  /**
   * Check for updates for all models
   */
  async checkAllForUpdates(): Promise<UpdateCheckResult[]> {
    const allModels = await this.repository.findAll();
    const results: UpdateCheckResult[] = [];

    // Group models by name to find latest versions
    const modelGroups = new Map<string, ModelMetadata[]>();
    for (const model of allModels) {
      if (!modelGroups.has(model.name)) {
        modelGroups.set(model.name, []);
      }
      modelGroups.get(model.name)!.push(model);
    }

    for (const [modelName, models] of modelGroups) {
      // Find the latest version for this model name
      const latestModel = await this.getLatestVersion(modelName);
      if (!latestModel) continue;

      // Check each model instance against the latest
      for (const model of models) {
        if (model.id === latestModel.id) continue; // Skip if this is already the latest

        const hasUpdate = this.compareVersions(latestModel.version, model.version) > 0;
        
        let updateType: 'major' | 'minor' | 'patch' | 'prerelease' | 'none' = 'none';
        let isBreakingChange = false;

        if (hasUpdate) {
          try {
            const currentVersionInfo = this.parseVersion(model.version);
            const latestVersionInfo = this.parseVersion(latestModel.version);

            if (latestVersionInfo.major > currentVersionInfo.major) {
              updateType = 'major';
              isBreakingChange = true;
            } else if (latestVersionInfo.minor > currentVersionInfo.minor) {
              updateType = 'minor';
            } else if (latestVersionInfo.patch > currentVersionInfo.patch) {
              updateType = 'patch';
            } else if (latestVersionInfo.isPrerelease) {
              updateType = 'prerelease';
            }
          } catch {
            updateType = 'minor';
          }
        }

        results.push({
          modelId: model.id,
          modelName: model.name,
          currentVersion: model.version,
          latestVersion: latestModel.version,
          hasUpdate,
          updateType,
          isBreakingChange,
          downloadUrl: latestModel.downloadUrl,
        });
      }
    }

    return results;
  }

  /**
   * Update a model to the latest version
   */
  async updateToLatest(modelId: string, options: UpdateOptions = {}): Promise<{
    success: boolean;
    oldVersion: string;
    newVersion: string;
    backupId?: string;
    error?: string;
  }> {
    try {
      const updateCheck = await this.checkForUpdates(modelId);
      
      if (!updateCheck.hasUpdate) {
        return {
          success: false,
          oldVersion: updateCheck.currentVersion,
          newVersion: updateCheck.currentVersion,
          error: 'No updates available',
        };
      }

      // Check update constraints
      if (!this.shouldAllowUpdate(updateCheck.updateType, options)) {
        return {
          success: false,
          oldVersion: updateCheck.currentVersion,
          newVersion: updateCheck.latestVersion,
          error: `Update type '${updateCheck.updateType}' not allowed by options`,
        };
      }

      // Check for breaking changes
      if (updateCheck.isBreakingChange && !options.force) {
        return {
          success: false,
          oldVersion: updateCheck.currentVersion,
          newVersion: updateCheck.latestVersion,
          error: 'Breaking change detected. Use force=true to proceed',
        };
      }

      const currentModel = await this.repository.findById(modelId);
      if (!currentModel) {
        throw new ValidationError('Model not found');
      }

      let backupId: string | undefined;

      // Create backup if requested
      if (options.backup) {
        const backupResult = await this.createBackup(currentModel);
        backupId = backupResult.backupId;
      }

      // Install the new version if auto-install is enabled
      if (options.autoInstall && updateCheck.downloadUrl) {
        const installRequest = {
          modelData: {
            name: updateCheck.modelName,
            version: updateCheck.latestVersion,
            modelType: currentModel.modelType,
            framework: currentModel.framework,
            downloadUrl: updateCheck.downloadUrl,
            fileSize: 0, // Will be determined during download
            checksum: '', // Will be calculated during download
            tags: currentModel.tags || [],
            capabilities: currentModel.capabilities,
          },
          options: {
            overwrite: true,
            skipValidation: false,
          },
        };

        const installResult = await this.modelService.installModel(installRequest);
        if (!installResult.success) {
          return {
            success: false,
            oldVersion: updateCheck.currentVersion,
            newVersion: updateCheck.latestVersion,
            backupId,
            error: `Installation failed: ${installResult.error}`,
          };
        }
      }

      return {
        success: true,
        oldVersion: updateCheck.currentVersion,
        newVersion: updateCheck.latestVersion,
        backupId,
      };

    } catch (error: any) {
      return {
        success: false,
        oldVersion: '',
        newVersion: '',
        error: error.message,
      };
    }
  }

  /**
   * Create a backup of a model
   */
  private async createBackup(model: ModelMetadata): Promise<{ backupId: string }> {
    const backupData = {
      ...model,
      name: `${model.name}-backup`,
      version: `${model.version}-backup-${Date.now()}`,
      description: `Backup of ${model.name} v${model.version} created on ${new Date().toISOString()}`,
    };

    const backup = await this.repository.create(backupData);
    return { backupId: backup.id };
  }

  /**
   * Check if update should be allowed based on options
   */
  private shouldAllowUpdate(updateType: string, options: UpdateOptions): boolean {
    switch (updateType) {
      case 'major':
        return options.allowMajor ?? false;
      case 'minor':
        return options.allowMinor ?? true;
      case 'patch':
        return options.allowPatch ?? true;
      case 'prerelease':
        return options.allowPrerelease ?? false;
      default:
        return false;
    }
  }

  /**
   * Get version history for a model
   */
  async getVersionHistory(modelName: string): Promise<{
    modelName: string;
    versions: Array<{
      version: string;
      id: string;
      createdAt: Date;
      description?: string;
      isLatest: boolean;
      isPrerelease: boolean;
      downloadCount?: number;
    }>;
  }> {
    const versions = await this.getAllVersions(modelName);
    const latestVersion = await this.getLatestVersion(modelName);

    return {
      modelName,
      versions: versions.map(model => ({
        version: model.version,
        id: model.id,
        createdAt: model.createdAt,
        description: model.description,
        isLatest: latestVersion?.id === model.id,
        isPrerelease: (() => {
          try {
            return this.parseVersion(model.version).isPrerelease;
          } catch {
            return false;
          }
        })(),
        downloadCount: model.downloadCount,
      })),
    };
  }

  /**
   * Find models that need updates
   */
  async findOutdatedModels(maxAge?: number): Promise<ModelMetadata[]> {
    const allModels = await this.repository.findAll();
    const updateChecks = await this.checkAllForUpdates();
    
    const outdatedIds = updateChecks
      .filter(check => check.hasUpdate)
      .map(check => check.modelId);

    const outdatedModels = allModels.filter(model => 
      outdatedIds.includes(model.id)
    );

    // If maxAge is specified, filter by creation date
    if (maxAge) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAge);
      
      return outdatedModels.filter(model => 
        model.createdAt < cutoffDate
      );
    }

    return outdatedModels;
  }
}
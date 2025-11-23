import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { ModelEntity } from '@/database/entities/ModelEntity';
import { AppDataSource } from '@/database/config/database.config';
import {
  IModelRepository,
  ModelMetadata,
  ModelCreateData,
  ModelUpdateData,
  ModelFilter,
  ModelType,
  MLFramework,
  ModelCapability,
} from '@/interfaces/IModelRepository';
import { NotFoundError, ValidationError } from '@/utils/errors';

/**
 * Model Repository Service Implementation
 * 
 * Single Responsibility: Handle model metadata persistence operations
 * Open/Closed: Extensible for new query methods
 * Liskov Substitution: Implements IModelRepository contract
 * Interface Segregation: Only model data operations
 * Dependency Inversion: Depends on TypeORM abstractions
 */
export class ModelRepositoryService implements IModelRepository {
  private repository: Repository<ModelEntity>;

  constructor(dataSource?: DataSource) {
    const ds = dataSource || AppDataSource;
    this.repository = ds.getRepository(ModelEntity);
  }

  /**
   * Create a new model record
   */
  async create(modelData: ModelCreateData): Promise<ModelMetadata> {
    try {
      const entity = this.repository.create({
        name: modelData.name,
        version: modelData.version,
        description: modelData.description || null,
        modelType: modelData.modelType,
        framework: modelData.framework,
        downloadUrl: modelData.downloadUrl,
        fileSize: modelData.fileSize,
        checksum: modelData.checksum,
        tags: modelData.tags || [],
        minFrameworkVersion: modelData.minFrameworkVersion || null,
        requiredGPU: modelData.requiredGPU || false,
        capabilities: modelData.capabilities,
        metadata: {} as any,
        downloadCount: 0,
        isActive: true,
        isPublic: true,
        isLatest: false,
        isValidated: false,
      });

      const savedEntity = await this.repository.save(entity);
      return this.entityToMetadata(savedEntity);
    } catch (error: any) {
      if (error.code === '23505' || error.code === 'SQLITE_CONSTRAINT') {
        throw new ValidationError(
          `Model ${modelData.name} version ${modelData.version} already exists`,
          { name: modelData.name, version: modelData.version }
        );
      }
      throw new ValidationError(
        `Failed to create model: ${error.message}`,
        { originalError: error }
      );
    }
  }

  /**
   * Find model by ID
   */
  async findById(id: string): Promise<ModelMetadata | null> {
    try {
      const entity = await this.repository.findOne({
        where: { id },
      });

      return entity ? this.entityToMetadata(entity) : null;
    } catch (error: any) {
      throw new ValidationError(
        `Failed to find model by ID: ${error.message}`,
        { id }
      );
    }
  }

  /**
   * Find model by name and version
   */
  async findByNameAndVersion(name: string, version: string): Promise<ModelMetadata | null> {
    try {
      const entity = await this.repository.findOne({
        where: { name, version },
      });

      return entity ? this.entityToMetadata(entity) : null;
    } catch (error: any) {
      throw new ValidationError(
        `Failed to find model by name and version: ${error.message}`,
        { name, version }
      );
    }
  }

  /**
   * Find all models with optional filtering
   */
  async findAll(filter: ModelFilter = {}): Promise<ModelMetadata[]> {
    try {
      const queryBuilder = this.repository.createQueryBuilder('model');

      // Apply filters
      this.applyFilters(queryBuilder, filter);

      // Apply sorting
      this.applySorting(queryBuilder, filter);

      // Apply pagination
      if (filter.limit) {
        queryBuilder.take(filter.limit);
      }
      if (filter.offset) {
        queryBuilder.skip(filter.offset);
      }

      const entities = await queryBuilder.getMany();
      return entities.map(entity => this.entityToMetadata(entity));
    } catch (error: any) {
      throw new ValidationError(
        `Failed to find models: ${error.message}`,
        { filter }
      );
    }
  }

  /**
   * Update model metadata
   */
  async update(id: string, updateData: ModelUpdateData): Promise<ModelMetadata | null> {
    try {
      const entity = await this.repository.findOne({ where: { id } });
      
      if (!entity) {
        return null;
      }

      // Update only provided fields
      if (updateData.description !== undefined) {
        entity.description = updateData.description || null;
      }
      if (updateData.downloadUrl) {
        entity.downloadUrl = updateData.downloadUrl;
      }
      if (updateData.fileSize !== undefined) {
        entity.fileSize = updateData.fileSize;
      }
      if (updateData.checksum) {
        entity.checksum = updateData.checksum;
      }
      if (updateData.tags) {
        entity.tags = updateData.tags;
      }
      if (updateData.minFrameworkVersion !== undefined) {
        entity.minFrameworkVersion = updateData.minFrameworkVersion || null;
      }
      if (updateData.requiredGPU !== undefined) {
        entity.requiredGPU = updateData.requiredGPU;
      }
      if (updateData.capabilities) {
        entity.capabilities = updateData.capabilities;
      }
      if (updateData.isLatest !== undefined) {
        entity.isLatest = updateData.isLatest;
      }
      if (updateData.isActive !== undefined) {
        entity.isActive = updateData.isActive;
      }
      if (updateData.isPublic !== undefined) {
        entity.isPublic = updateData.isPublic;
      }
      if (updateData.isValidated !== undefined) {
        entity.isValidated = updateData.isValidated;
      }

      const updatedEntity = await this.repository.save(entity);
      return this.entityToMetadata(updatedEntity);
    } catch (error: any) {
      throw new ValidationError(
        `Failed to update model: ${error.message}`,
        { id, updateData }
      );
    }
  }

  /**
   * Delete model record (soft delete)
   */
  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.repository.softDelete(id);
      return result.affected ? result.affected > 0 : false;
    } catch (error: any) {
      throw new ValidationError(
        `Failed to delete model: ${error.message}`,
        { id }
      );
    }
  }

  /**
   * Check if model exists
   */
  async exists(id: string): Promise<boolean> {
    try {
      const count = await this.repository.count({
        where: { id },
      });
      return count > 0;
    } catch (error: any) {
      throw new ValidationError(
        `Failed to check model existence: ${error.message}`,
        { id }
      );
    }
  }

  /**
   * Find models by capability
   */
  async findByCapability(capability: ModelCapability): Promise<ModelMetadata[]> {
    try {
      // For SQLite compatibility, we use LIKE instead of array operators
      const entities = await this.repository
        .createQueryBuilder('model')
        .where('model.capabilities LIKE :capability', { 
          capability: `%${capability}%` 
        })
        .getMany();

      // Filter results to ensure exact capability match
      const filteredEntities = entities.filter(entity => 
        entity.capabilities.includes(capability)
      );

      return filteredEntities.map(entity => this.entityToMetadata(entity));
    } catch (error: any) {
      throw new ValidationError(
        `Failed to find models by capability: ${error.message}`,
        { capability }
      );
    }
  }

  /**
   * Find latest version of models by name
   */
  async findLatestVersions(): Promise<ModelMetadata[]> {
    try {
      const entities = await this.repository.find({
        where: { isLatest: true },
        order: { createdAt: 'DESC' },
      });

      return entities.map(entity => this.entityToMetadata(entity));
    } catch (error: any) {
      throw new ValidationError(
        `Failed to find latest model versions: ${error.message}`
      );
    }
  }

  /**
   * Search models by text query
   */
  async search(query: string): Promise<ModelMetadata[]> {
    try {
      const searchTerm = `%${query.toLowerCase()}%`;
      
      const entities = await this.repository
        .createQueryBuilder('model')
        .where('LOWER(model.name) LIKE :search', { search: searchTerm })
        .orWhere('LOWER(model.description) LIKE :search', { search: searchTerm })
        .orWhere('LOWER(model.tags) LIKE :search', { search: searchTerm })
        .orderBy('model.createdAt', 'DESC')
        .getMany();

      return entities.map(entity => this.entityToMetadata(entity));
    } catch (error: any) {
      throw new ValidationError(
        `Failed to search models: ${error.message}`,
        { query }
      );
    }
  }

  /**
   * Private helper methods
   */

  private applyFilters(queryBuilder: SelectQueryBuilder<ModelEntity>, filter: ModelFilter): void {
    if (filter.modelType) {
      queryBuilder.andWhere('model.modelType = :modelType', { 
        modelType: filter.modelType 
      });
    }

    if (filter.framework) {
      queryBuilder.andWhere('model.framework = :framework', { 
        framework: filter.framework 
      });
    }

    if (filter.capabilities && filter.capabilities.length > 0) {
      // For each capability, check if it exists in the capabilities array
      filter.capabilities.forEach((capability, index) => {
        queryBuilder.andWhere(`model.capabilities LIKE :capability${index}`, { 
          [`capability${index}`]: `%${capability}%` 
        });
      });
    }

    if (filter.tags && filter.tags.length > 0) {
      filter.tags.forEach((tag, index) => {
        queryBuilder.andWhere(`model.tags LIKE :tag${index}`, { 
          [`tag${index}`]: `%${tag.toLowerCase()}%` 
        });
      });
    }

    if (filter.minFileSize !== undefined) {
      queryBuilder.andWhere('model.fileSize >= :minFileSize', { 
        minFileSize: filter.minFileSize 
      });
    }

    if (filter.maxFileSize !== undefined) {
      queryBuilder.andWhere('model.fileSize <= :maxFileSize', { 
        maxFileSize: filter.maxFileSize 
      });
    }

    if (filter.search) {
      const searchTerm = `%${filter.search.toLowerCase()}%`;
      queryBuilder.andWhere(
        '(LOWER(model.name) LIKE :search OR LOWER(model.description) LIKE :search OR LOWER(model.tags) LIKE :search)',
        { search: searchTerm }
      );
    }

    // Always exclude soft-deleted records
    queryBuilder.andWhere('model.deletedAt IS NULL');
  }

  private applySorting(queryBuilder: SelectQueryBuilder<ModelEntity>, filter: ModelFilter): void {
    const sortBy = filter.sortBy || 'createdAt';
    const sortOrder = filter.sortOrder || 'desc';

    switch (sortBy) {
      case 'name':
        queryBuilder.orderBy('model.name', sortOrder.toUpperCase() as 'ASC' | 'DESC');
        break;
      case 'version':
        queryBuilder.orderBy('model.version', sortOrder.toUpperCase() as 'ASC' | 'DESC');
        break;
      case 'fileSize':
        queryBuilder.orderBy('model.fileSize', sortOrder.toUpperCase() as 'ASC' | 'DESC');
        break;
      case 'createdAt':
      default:
        queryBuilder.orderBy('model.createdAt', sortOrder.toUpperCase() as 'ASC' | 'DESC');
        break;
    }
  }

  private entityToMetadata(entity: ModelEntity): ModelMetadata {
    return {
      id: entity.id,
      name: entity.name,
      version: entity.version,
      description: entity.description || undefined,
      modelType: entity.modelType,
      framework: entity.framework,
      fileSize: entity.fileSize,
      checksum: entity.checksum,
      downloadUrl: entity.downloadUrl,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      tags: entity.tags || [],
      minFrameworkVersion: entity.minFrameworkVersion || undefined,
      requiredGPU: entity.requiredGPU || false,
      capabilities: entity.capabilities || [],
      
      // Additional entity fields
      downloadCount: entity.downloadCount,
      lastDownloadedAt: entity.lastDownloadedAt || undefined,
      lastUsedAt: entity.lastUsedAt || undefined,
      isActive: entity.isActive,
      isPublic: entity.isPublic,
      isLatest: entity.isLatest,
      parentModelId: entity.parentModelId || undefined,
      isValidated: entity.isValidated,
      validatedAt: entity.validatedAt || undefined,
      validationResults: entity.validationResults || undefined,
      metadata: entity.metadata,
      
      // Bind entity methods
      getFormattedFileSize: () => entity.getFormattedFileSize(),
      isCompatibleWith: (platform: string) => entity.isCompatibleWith(platform),
      getAgeInDays: () => entity.getAgeInDays(),
      needsUpdate: () => entity.needsUpdate(),
      recordUsage: () => entity.recordUsage(),
      toSummary: () => entity.toSummary(),
      toDetail: () => entity.toDetail(),
    };
  }
}
import { Repository, FindManyOptions, Like, In } from 'typeorm';
import { IContentRepository } from '@/interfaces/IContentRepository';
import { Content, ContentData, ContentUpdateDto, ContentFilter, ContentType, ContentStatus } from '@/models/Content';
import { ContentEntity } from '@/database/entities/ContentEntity';
import { AppDataSource } from '@/database/config/database.config';
import { NotFoundError, InternalServerError } from '@/utils/errors';

/**
 * Content Repository Implementation
 * 
 * Single Responsibility: Data access operations for content
 * Implements: IContentRepository interface
 * Uses: TypeORM for database operations with PostgreSQL
 */
export class ContentRepository implements IContentRepository {
  private repository: Repository<ContentEntity>;

  constructor() {
    this.repository = AppDataSource.getRepository(ContentEntity);
  }

  /**
   * Create new content entry
   */
  async create(contentData: ContentData): Promise<Content> {
    try {
      // Map ContentData to ContentEntity
      const entity = this.repository.create({
        id: contentData.id,
        userId: contentData.userId,
        fileName: contentData.fileName,
        originalFileName: contentData.originalFileName,
        mimeType: contentData.mimeType,
        fileSize: contentData.fileSize,
        filePath: contentData.filePath,
        thumbnailPath: contentData.thumbnailPath || null,
        title: contentData.title,
        description: contentData.description || null,
        tags: contentData.tags || [],
        contentType: contentData.contentType,
        duration: contentData.duration || null,
        width: contentData.width || null,
        height: contentData.height || null,
        metadata: contentData.metadata || {},
        status: contentData.status || ContentStatus.PROCESSING,
        isPublic: contentData.isPublic || false,
      });

      const savedEntity = await this.repository.save(entity);
      
      return this.entityToModel(savedEntity);
    } catch (error) {
      throw new InternalServerError(`Failed to create content: ${error.message}`);
    }
  }

  /**
   * Find content by ID
   */
  async findById(id: string): Promise<Content | null> {
    try {
      const entity = await this.repository.findOne({
        where: { id },
      });

      if (!entity) {
        return null;
      }

      return this.entityToModel(entity);
    } catch (error) {
      throw new InternalServerError(`Failed to find content: ${error.message}`);
    }
  }

  /**
   * Find all content with optional filtering
   */
  async findAll(filter?: ContentFilter): Promise<Content[]> {
    try {
      const options = this.buildFindOptions(filter);
      
      const entities = await this.repository.find(options);
      
      return entities.map(entity => this.entityToModel(entity));
    } catch (error) {
      throw new InternalServerError(`Failed to find content: ${error.message}`);
    }
  }

  /**
   * Update content by ID
   */
  async update(id: string, updateData: ContentUpdateDto): Promise<Content | null> {
    try {
      // Check if content exists
      const existingEntity = await this.repository.findOne({
        where: { id },
      });

      if (!existingEntity) {
        return null;
      }

      // Update only provided fields
      if (updateData.title !== undefined) {
        existingEntity.title = updateData.title;
      }
      if (updateData.description !== undefined) {
        existingEntity.description = updateData.description;
      }
      if (updateData.tags !== undefined) {
        existingEntity.tags = updateData.tags;
      }
      if (updateData.isPublic !== undefined) {
        existingEntity.isPublic = updateData.isPublic;
      }

      const updatedEntity = await this.repository.save(existingEntity);
      
      return this.entityToModel(updatedEntity);
    } catch (error) {
      throw new InternalServerError(`Failed to update content: ${error.message}`);
    }
  }

  /**
   * Delete content by ID (soft delete)
   */
  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.repository.softDelete(id);
      
      return result.affected !== undefined && result.affected > 0;
    } catch (error) {
      throw new InternalServerError(`Failed to delete content: ${error.message}`);
    }
  }

  /**
   * Get content by user ID
   */
  async findByUserId(userId: string): Promise<Content[]> {
    try {
      const entities = await this.repository.find({
        where: { 
          userId,
          deletedAt: null, // Exclude soft-deleted content
        },
        order: {
          createdAt: 'DESC',
        },
      });
      
      return entities.map(entity => this.entityToModel(entity));
    } catch (error) {
      throw new InternalServerError(`Failed to find user content: ${error.message}`);
    }
  }

  /**
   * Check if content exists
   */
  async exists(id: string): Promise<boolean> {
    try {
      const count = await this.repository.count({
        where: { id },
      });
      
      return count > 0;
    } catch (error) {
      throw new InternalServerError(`Failed to check content existence: ${error.message}`);
    }
  }

  /**
   * Helper methods
   */

  private buildFindOptions(filter?: ContentFilter): FindManyOptions<ContentEntity> {
    const options: FindManyOptions<ContentEntity> = {
      where: {
        deletedAt: null, // Exclude soft-deleted content by default
      },
      order: {},
    };

    if (!filter) {
      return options;
    }

    // Build where conditions
    if (filter.contentType) {
      options.where.contentType = filter.contentType;
    }

    if (filter.status) {
      options.where.status = filter.status;
    }

    if (filter.isPublic !== undefined) {
      options.where.isPublic = filter.isPublic;
    }

    if (filter.tags && filter.tags.length > 0) {
      // PostgreSQL array contains operation
      options.where = {
        ...options.where,
        tags: () => `tags && ARRAY[${filter.tags.map(tag => `'${tag}'`).join(',')}]`,
      };
    }

    if (filter.search) {
      // Search in title and description
      options.where = [
        { ...options.where, title: Like(`%${filter.search}%`) },
        { ...options.where, description: Like(`%${filter.search}%`) },
      ];
    }

    // Pagination
    if (filter.limit) {
      options.take = filter.limit;
    }

    if (filter.offset) {
      options.skip = filter.offset;
    }

    // Sorting
    if (filter.sortBy) {
      const order = filter.sortOrder || 'desc';
      options.order[filter.sortBy] = order.toUpperCase() as 'ASC' | 'DESC';
    } else {
      // Default sorting by creation date
      options.order.createdAt = 'DESC';
    }

    return options;
  }

  /**
   * Convert ContentEntity to Content domain model
   */
  private entityToModel(entity: ContentEntity): Content {
    return new Content({
      id: entity.id,
      userId: entity.userId,
      fileName: entity.fileName,
      originalFileName: entity.originalFileName,
      mimeType: entity.mimeType,
      fileSize: entity.fileSize,
      filePath: entity.filePath,
      thumbnailPath: entity.thumbnailPath,
      title: entity.title,
      description: entity.description,
      tags: entity.tags,
      contentType: entity.contentType,
      duration: entity.duration,
      width: entity.width,
      height: entity.height,
      metadata: entity.metadata,
      status: entity.status,
      isPublic: entity.isPublic,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    });
  }
}
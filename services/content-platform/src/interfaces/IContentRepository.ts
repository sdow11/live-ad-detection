import { Content, ContentCreateDto, ContentUpdateDto, ContentFilter, ContentData } from '@/models/Content';

/**
 * Content Repository Interface
 * 
 * Single Responsibility: Data access operations for content
 * Interface Segregation: Only content-related data operations
 * Dependency Inversion: High-level modules depend on this abstraction
 */
export interface IContentRepository {
  /**
   * Create new content entry
   */
  create(contentData: ContentData): Promise<Content>;

  /**
   * Find content by ID
   */
  findById(id: string): Promise<Content | null>;

  /**
   * Find all content with optional filtering
   */
  findAll(filter?: ContentFilter): Promise<Content[]>;

  /**
   * Update content by ID
   */
  update(id: string, updateData: ContentUpdateDto): Promise<Content | null>;

  /**
   * Delete content by ID (soft delete)
   */
  delete(id: string): Promise<boolean>;

  /**
   * Get content by user ID
   */
  findByUserId(userId: string): Promise<Content[]>;

  /**
   * Check if content exists
   */
  exists(id: string): Promise<boolean>;
}
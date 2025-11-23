import { Content, ContentCreateDto, ContentUpdateDto, ContentFilter } from '@/models/Content';

/**
 * Content Service Interface
 * 
 * Single Responsibility: Business logic for content management
 * Interface Segregation: Content business operations only
 * Dependency Inversion: Controllers depend on this abstraction
 */
export interface IContentService {
  /**
   * Upload and create new content
   */
  uploadContent(
    file: Express.Multer.File,
    metadata: ContentCreateDto,
    userId: string
  ): Promise<Content>;

  /**
   * Get content by ID
   */
  getContentById(id: string): Promise<Content>;

  /**
   * Get all content for a user
   */
  getUserContent(userId: string, filter?: ContentFilter): Promise<Content[]>;

  /**
   * Update content metadata
   */
  updateContent(
    id: string,
    updateData: ContentUpdateDto,
    userId: string
  ): Promise<Content>;

  /**
   * Delete content (soft delete)
   */
  deleteContent(id: string, userId: string): Promise<boolean>;

  /**
   * Get content download URL
   */
  getContentUrl(id: string): Promise<string>;

  /**
   * Validate content ownership
   */
  validateContentOwnership(contentId: string, userId: string): Promise<boolean>;

  /**
   * Get content statistics
   */
  getContentStats(userId?: string): Promise<ContentStats>;
}

export interface ContentStats {
  totalContent: number;
  totalSize: number; // bytes
  contentByType: Record<string, number>;
  recentUploads: number; // last 7 days
}
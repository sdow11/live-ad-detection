import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { IContentService, ContentStats } from '@/interfaces/IContentService';
import { IContentRepository } from '@/interfaces/IContentRepository';
import { IStorageService } from '@/interfaces/IStorageService';
import { IMediaProcessor } from '@/interfaces/IMediaProcessor';
import { 
  Content, 
  ContentCreateDto, 
  ContentUpdateDto, 
  ContentFilter, 
  ContentType,
  ContentStatus 
} from '@/models/Content';

/**
 * Content Service Implementation
 * 
 * Single Responsibility: Business logic for content management
 * Open/Closed: Extensible through dependency injection
 * Liskov Substitution: Implements IContentService contract
 * Interface Segregation: Depends only on needed interfaces
 * Dependency Inversion: Depends on abstractions, not concretions
 */
export class ContentService implements IContentService {
  constructor(
    private readonly contentRepository: IContentRepository,
    private readonly storageService: IStorageService,
    private readonly mediaProcessor: IMediaProcessor
  ) {}

  /**
   * Upload and create new content
   * 
   * Business logic:
   * 1. Validate file
   * 2. Upload to storage
   * 3. Process media (thumbnails, metadata)
   * 4. Create database record
   * 5. Queue background processing
   */
  async uploadContent(
    file: Express.Multer.File,
    metadata: ContentCreateDto,
    userId: string
  ): Promise<Content> {
    try {
      // Validate file
      await this.validateUploadedFile(file);

      // Generate unique file name
      const fileId = uuidv4();
      const fileExtension = path.extname(file.originalname);
      const fileName = `${fileId}${fileExtension}`;
      const destination = `content/${userId}/${fileName}`;

      // Upload file to storage
      const uploadResult = await this.storageService.uploadFile(file, destination);

      // Validate media file
      const validation = await this.mediaProcessor.validateMediaFile(uploadResult.filePath);
      if (!validation.isValid) {
        // Cleanup uploaded file
        await this.storageService.deleteFile(uploadResult.filePath);
        throw new Error(`Invalid media file: ${validation.errors.join(', ')}`);
      }

      // Get media metadata
      const mediaMetadata = await this.mediaProcessor.getMediaMetadata(uploadResult.filePath);

      // Determine content type
      const contentType = this.determineContentType(file.mimetype, validation.mediaType);

      // Create content record
      const contentData = {
        id: fileId,
        userId,
        fileName,
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        filePath: uploadResult.filePath,
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags || [],
        contentType,
        duration: mediaMetadata.duration,
        width: mediaMetadata.width,
        height: mediaMetadata.height,
        metadata: {
          bitrate: mediaMetadata.bitrate,
          codec: mediaMetadata.codec,
          format: mediaMetadata.format,
          uploadedFrom: 'web',
          processingInfo: {
            validated: true,
            thumbnailGenerated: false,
            transcoded: false,
          },
        },
        status: ContentStatus.PROCESSING,
        isPublic: metadata.isPublic || false,
      };

      const content = await this.contentRepository.create(contentData);

      // Queue background processing (thumbnail generation, etc.)
      this.queueBackgroundProcessing(content);

      return content;
    } catch (error) {
      throw new Error(`Failed to upload content: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get content by ID
   */
  async getContentById(id: string): Promise<Content> {
    const content = await this.contentRepository.findById(id);
    
    if (!content || content.isDeleted()) {
      throw new Error('Content not found');
    }

    return content;
  }

  /**
   * Get all content for a user
   */
  async getUserContent(userId: string, filter?: ContentFilter): Promise<Content[]> {
    if (!userId) {
      throw new Error('User ID is required');
    }

    return await this.contentRepository.findByUserId(userId);
  }

  /**
   * Update content metadata
   */
  async updateContent(
    id: string,
    updateData: ContentUpdateDto,
    userId: string
  ): Promise<Content> {
    // Validate ownership
    const hasAccess = await this.validateContentOwnership(id, userId);
    if (!hasAccess) {
      throw new Error('Content not found or access denied');
    }

    const updatedContent = await this.contentRepository.update(id, updateData);
    if (!updatedContent) {
      throw new Error('Failed to update content');
    }

    return updatedContent;
  }

  /**
   * Delete content (soft delete)
   */
  async deleteContent(id: string, userId: string): Promise<boolean> {
    // Validate ownership
    const hasAccess = await this.validateContentOwnership(id, userId);
    if (!hasAccess) {
      throw new Error('Content not found or access denied');
    }

    const success = await this.contentRepository.delete(id);
    
    if (success) {
      // Queue cleanup of associated files
      this.queueFileCleanup(id);
    }

    return success;
  }

  /**
   * Get content download URL
   */
  async getContentUrl(id: string): Promise<string> {
    const content = await this.getContentById(id);
    return await this.storageService.getFileUrl(content.filePath);
  }

  /**
   * Validate content ownership
   */
  async validateContentOwnership(contentId: string, userId: string): Promise<boolean> {
    const content = await this.contentRepository.findById(contentId);
    
    if (!content || content.isDeleted()) {
      return false;
    }

    return content.userId === userId;
  }

  /**
   * Get content statistics
   */
  async getContentStats(userId?: string): Promise<ContentStats> {
    const contents = userId 
      ? await this.contentRepository.findByUserId(userId)
      : await this.contentRepository.findAll();

    const activeContents = contents.filter(c => !c.isDeleted());

    const totalSize = activeContents.reduce((sum, content) => sum + content.fileSize, 0);
    
    const contentByType = activeContents.reduce((acc, content) => {
      acc[content.contentType] = (acc[content.contentType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const recentUploads = activeContents.filter(
      content => content.createdAt >= oneWeekAgo
    ).length;

    return {
      totalContent: activeContents.length,
      totalSize,
      contentByType,
      recentUploads,
    };
  }

  /**
   * Private helper methods
   */

  private async validateUploadedFile(file: Express.Multer.File): Promise<void> {
    const maxFileSize = 2 * 1024 * 1024 * 1024; // 2GB
    const allowedMimeTypes = [
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ];

    if (file.size > maxFileSize) {
      throw new Error('File size exceeds maximum limit of 2GB');
    }

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new Error(`Unsupported file type: ${file.mimetype}`);
    }

    if (!file.originalname || file.originalname.trim().length === 0) {
      throw new Error('File name is required');
    }
  }

  private determineContentType(mimeType: string, mediaType: string): ContentType {
    if (mimeType.startsWith('video/') || mediaType === 'video') {
      return ContentType.VIDEO;
    }
    
    if (mimeType.startsWith('image/') || mediaType === 'image') {
      return ContentType.IMAGE;
    }

    throw new Error(`Unsupported content type for MIME type: ${mimeType}`);
  }

  private async queueBackgroundProcessing(content: Content): Promise<void> {
    // In a real implementation, this would queue jobs for:
    // - Thumbnail generation
    // - Video transcoding
    // - Content optimization
    // - Virus scanning
    // For now, we'll simulate immediate processing

    try {
      if (content.contentType === ContentType.VIDEO) {
        await this.generateVideoThumbnail(content);
      } else if (content.contentType === ContentType.IMAGE) {
        await this.generateImageThumbnail(content);
      }

      // Update status to READY
      await this.contentRepository.update(content.id, {
        status: ContentStatus.READY,
      } as any);
      
    } catch (error) {
      console.error(`Background processing failed for content ${content.id}:`, error);
      
      // Update status to ERROR
      await this.contentRepository.update(content.id, {
        status: ContentStatus.ERROR,
      } as any);
    }
  }

  private async generateVideoThumbnail(content: Content): Promise<void> {
    const thumbnailPath = content.filePath.replace(path.extname(content.filePath), '-thumb.jpg');
    
    await this.mediaProcessor.generateVideoThumbnail(
      content.filePath,
      thumbnailPath,
      {
        timeOffset: 5, // 5 seconds into video
        width: 320,
        height: 180,
        quality: 80,
      }
    );

    // Update content with thumbnail path
    await this.contentRepository.update(content.id, {
      thumbnailPath,
      metadata: {
        ...content.metadata,
        processingInfo: {
          ...content.metadata.processingInfo,
          thumbnailGenerated: true,
        },
      },
    } as any);
  }

  private async generateImageThumbnail(content: Content): Promise<void> {
    const thumbnailPath = content.filePath.replace(path.extname(content.filePath), '-thumb.jpg');
    
    await this.mediaProcessor.generateImageThumbnail(
      content.filePath,
      thumbnailPath,
      {
        width: 320,
        height: 180,
        quality: 80,
        format: 'jpeg',
      }
    );

    // Update content with thumbnail path
    await this.contentRepository.update(content.id, {
      thumbnailPath,
      metadata: {
        ...content.metadata,
        processingInfo: {
          ...content.metadata.processingInfo,
          thumbnailGenerated: true,
        },
      },
    } as any);
  }

  private async queueFileCleanup(contentId: string): Promise<void> {
    // In a real implementation, this would queue a job to:
    // - Delete files from storage after a grace period
    // - Clean up associated thumbnails
    // - Remove from CDN cache
    console.log(`Queued file cleanup for content: ${contentId}`);
  }
}
import { Request, Response, NextFunction } from 'express';
import { IContentService } from '@/interfaces/IContentService';
import { ContentCreateDto, ContentUpdateDto, ContentFilter } from '@/models/Content';
import { ValidationError } from '@/utils/errors';
import { validateContentCreate, validateContentUpdate, validateContentFilter } from '@/validators/ContentValidator';

/**
 * Content Controller
 * 
 * Single Responsibility: Handle HTTP requests for content operations
 * Open/Closed: Extensible through middleware and dependency injection
 * Liskov Substitution: Can be substituted with other controller implementations
 * Interface Segregation: Only depends on IContentService
 * Dependency Inversion: Depends on abstractions, not concrete implementations
 */
export class ContentController {
  constructor(private readonly contentService: IContentService) {}

  /**
   * Upload new content
   * POST /api/content
   */
  createContent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate request
      if (!req.file) {
        throw new ValidationError('File is required');
      }

      if (!req.user?.id) {
        throw new ValidationError('User authentication required');
      }

      // Validate content metadata
      const validationResult = validateContentCreate(req.body);
      if (!validationResult.isValid) {
        throw new ValidationError('Invalid content metadata', validationResult.errors);
      }

      const metadata: ContentCreateDto = {
        title: req.body.title,
        description: req.body.description,
        tags: req.body.tags ? JSON.parse(req.body.tags) : [],
        isPublic: req.body.isPublic === 'true',
      };

      // Upload content
      const content = await this.contentService.uploadContent(
        req.file,
        metadata,
        req.user.id
      );

      res.status(201).json({
        success: true,
        data: {
          id: content.id,
          title: content.title,
          fileName: content.fileName,
          originalFileName: content.originalFileName,
          fileSize: content.fileSize,
          formattedFileSize: content.getFormattedFileSize(),
          contentType: content.contentType,
          status: content.status,
          duration: content.duration,
          formattedDuration: content.getFormattedDuration(),
          width: content.width,
          height: content.height,
          tags: content.tags,
          isPublic: content.isPublic,
          createdAt: content.createdAt,
        },
        message: 'Content uploaded successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get content by ID
   * GET /api/content/:id
   */
  getContent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        throw new ValidationError('Content ID is required');
      }

      const content = await this.contentService.getContentById(id);

      res.json({
        success: true,
        data: {
          id: content.id,
          title: content.title,
          description: content.description,
          fileName: content.fileName,
          originalFileName: content.originalFileName,
          fileSize: content.fileSize,
          formattedFileSize: content.getFormattedFileSize(),
          contentType: content.contentType,
          status: content.status,
          duration: content.duration,
          formattedDuration: content.getFormattedDuration(),
          width: content.width,
          height: content.height,
          tags: content.tags,
          isPublic: content.isPublic,
          thumbnailPath: content.thumbnailPath,
          metadata: content.metadata,
          createdAt: content.createdAt,
          updatedAt: content.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get user's content library
   * GET /api/content
   */
  listContent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new ValidationError('User authentication required');
      }

      // Validate query parameters
      const filterValidation = validateContentFilter(req.query);
      if (!filterValidation.isValid) {
        throw new ValidationError('Invalid filter parameters', filterValidation.errors);
      }

      const filter: ContentFilter = {
        contentType: req.query.contentType as any,
        status: req.query.status as any,
        isPublic: req.query.isPublic ? req.query.isPublic === 'true' : undefined,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        search: req.query.search as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      };

      const contents = await this.contentService.getUserContent(req.user.id, filter);

      res.json({
        success: true,
        data: {
          contents: contents.map(content => ({
            id: content.id,
            title: content.title,
            description: content.description,
            fileName: content.fileName,
            originalFileName: content.originalFileName,
            fileSize: content.fileSize,
            formattedFileSize: content.getFormattedFileSize(),
            contentType: content.contentType,
            status: content.status,
            duration: content.duration,
            formattedDuration: content.getFormattedDuration(),
            width: content.width,
            height: content.height,
            tags: content.tags,
            isPublic: content.isPublic,
            thumbnailPath: content.thumbnailPath,
            createdAt: content.createdAt,
            updatedAt: content.updatedAt,
          })),
          pagination: {
            limit: filter.limit || 20,
            offset: filter.offset || 0,
            total: contents.length,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update content metadata
   * PUT /api/content/:id
   */
  updateContent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        throw new ValidationError('Content ID is required');
      }

      if (!req.user?.id) {
        throw new ValidationError('User authentication required');
      }

      // Validate update data
      const validationResult = validateContentUpdate(req.body);
      if (!validationResult.isValid) {
        throw new ValidationError('Invalid update data', validationResult.errors);
      }

      const updateData: ContentUpdateDto = {
        title: req.body.title,
        description: req.body.description,
        tags: req.body.tags,
        isPublic: req.body.isPublic,
      };

      const updatedContent = await this.contentService.updateContent(
        id,
        updateData,
        req.user.id
      );

      res.json({
        success: true,
        data: {
          id: updatedContent.id,
          title: updatedContent.title,
          description: updatedContent.description,
          tags: updatedContent.tags,
          isPublic: updatedContent.isPublic,
          updatedAt: updatedContent.updatedAt,
        },
        message: 'Content updated successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Delete content
   * DELETE /api/content/:id
   */
  deleteContent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        throw new ValidationError('Content ID is required');
      }

      if (!req.user?.id) {
        throw new ValidationError('User authentication required');
      }

      await this.contentService.deleteContent(id, req.user.id);

      res.json({
        success: true,
        message: 'Content deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get content download URL
   * GET /api/content/:id/url
   */
  getContentUrl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        throw new ValidationError('Content ID is required');
      }

      const url = await this.contentService.getContentUrl(id);

      res.json({
        success: true,
        data: {
          url,
          expiresIn: 3600, // 1 hour
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get content statistics
   * GET /api/content/stats
   */
  getContentStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new ValidationError('User authentication required');
      }

      const stats = await this.contentService.getContentStats(req.user.id);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get content thumbnail
   * GET /api/content/:id/thumbnail
   */
  getContentThumbnail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        throw new ValidationError('Content ID is required');
      }

      const content = await this.contentService.getContentById(id);
      
      if (!content.thumbnailPath) {
        throw new ValidationError('Thumbnail not available for this content');
      }

      // Redirect to thumbnail file
      res.redirect(content.thumbnailPath);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Transcode content to different formats
   * POST /api/content/:id/transcode
   */
  transcodeContent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { resolution, bitrate, codec, format } = req.body;

      if (!id) {
        throw new ValidationError('Content ID is required');
      }

      if (!req.user?.id) {
        throw new ValidationError('User authentication required');
      }

      // For now, return a success message - transcoding would be implemented with a job queue
      res.json({
        success: true,
        message: 'Transcoding request submitted. You will be notified when complete.',
        data: {
          contentId: id,
          options: {
            resolution: resolution || 'original',
            bitrate: bitrate || 'auto',
            codec: codec || 'libx264',
            format: format || 'mp4',
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get user's content library (alternative endpoint)
   * GET /api/content/user/:userId
   */
  getUserContent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      // Ensure user can only access their own content or is admin
      if (!req.user?.id || (req.user.id !== userId && req.user.role !== 'admin')) {
        throw new ValidationError('Access denied');
      }

      const contents = await this.contentService.getUserContent(userId);

      res.json({
        success: true,
        data: contents.map(content => ({
          id: content.id,
          title: content.title,
          fileName: content.fileName,
          contentType: content.contentType,
          status: content.status,
          formattedFileSize: content.getFormattedFileSize(),
          formattedDuration: content.getFormattedDuration(),
          isPublic: content.isPublic,
          createdAt: content.createdAt,
        })),
        count: contents.length,
      });
    } catch (error) {
      next(error);
    }
  };
}

// Type augmentation for Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        role?: string;
      };
    }
  }
}
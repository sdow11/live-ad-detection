import { Router } from 'express';
import multer from 'multer';
import { ContentController } from '@/controllers/ContentController';
import { authMiddleware } from '@/middleware/authMiddleware';
import { uploadMiddleware } from '@/middleware/uploadMiddleware';
import { rateLimitMiddleware } from '@/middleware/rateLimitMiddleware';

/**
 * Content Routes
 * 
 * Single Responsibility: Define HTTP routes for content operations
 * Dependency Inversion: Receives controller through dependency injection
 */
export function createContentRoutes(contentController: ContentController): Router {
  const router = Router();

  // Configure multer for file uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 2 * 1024 * 1024 * 1024, // 2GB
      files: 1,
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = [
        'video/mp4',
        'video/quicktime',
        'video/x-msvideo',
        'video/webm',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
      ];

      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported file type: ${file.mimetype}`));
      }
    },
  });

  // Apply middleware to all routes
  router.use(authMiddleware);
  router.use(rateLimitMiddleware);

  /**
   * @route   POST /api/content
   * @desc    Upload new content
   * @access  Private
   */
  router.post(
    '/',
    upload.single('file'),
    uploadMiddleware,
    contentController.uploadContent
  );

  /**
   * @route   GET /api/content
   * @desc    Get user's content library
   * @access  Private
   */
  router.get('/', contentController.getUserContent);

  /**
   * @route   GET /api/content/stats
   * @desc    Get content statistics
   * @access  Private
   */
  router.get('/stats', contentController.getContentStats);

  /**
   * @route   GET /api/content/:id
   * @desc    Get content by ID
   * @access  Private
   */
  router.get('/:id', contentController.getContent);

  /**
   * @route   PUT /api/content/:id
   * @desc    Update content metadata
   * @access  Private
   */
  router.put('/:id', contentController.updateContent);

  /**
   * @route   DELETE /api/content/:id
   * @desc    Delete content
   * @access  Private
   */
  router.delete('/:id', contentController.deleteContent);

  /**
   * @route   GET /api/content/:id/url
   * @desc    Get content download URL
   * @access  Private
   */
  router.get('/:id/url', contentController.getContentUrl);

  return router;
}
import { Request, Response, NextFunction } from 'express';
import { validateFileUpload } from '@/validators/ContentValidator';
import { ValidationError } from '@/utils/errors';

/**
 * Upload Validation Middleware
 * 
 * Single Responsibility: Validate uploaded files
 */
export function uploadMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    // Validate uploaded file
    const validation = validateFileUpload(req.file);
    
    if (!validation.isValid) {
      throw new ValidationError('Invalid file upload', validation.errors);
    }

    // Add file metadata to request for logging/tracking
    if (req.file) {
      req.fileMetadata = {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedAt: new Date(),
      };
    }

    next();
  } catch (error) {
    next(error);
  }
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      fileMetadata?: {
        originalName: string;
        mimeType: string;
        size: number;
        uploadedAt: Date;
      };
    }
  }
}
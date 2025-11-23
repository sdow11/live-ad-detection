import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '@/utils/errors';

/**
 * Validation Middleware
 * 
 * Request validation for content upload and update operations
 */

/**
 * Validate content upload request
 */
export function validateContentUpload(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    // Check if file was uploaded
    if (!req.file) {
      throw new ValidationError('File is required', {
        field: 'file',
        code: 'MISSING_FILE',
      });
    }

    // Validate file size (additional check beyond multer)
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
    if (req.file.size > maxSize) {
      throw new ValidationError('File size exceeds 2GB limit', {
        field: 'file',
        code: 'FILE_TOO_LARGE',
        maxSize,
        actualSize: req.file.size,
      });
    }

    // Validate MIME type
    const allowedMimeTypes = [
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'video/webm',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ];

    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      throw new ValidationError(`Unsupported file type: ${req.file.mimetype}`, {
        field: 'file',
        code: 'INVALID_MIME_TYPE',
        allowedTypes: allowedMimeTypes,
        actualType: req.file.mimetype,
      });
    }

    // Validate optional fields from request body
    if (req.body.title) {
      validateTitle(req.body.title);
    }

    if (req.body.description) {
      validateDescription(req.body.description);
    }

    if (req.body.tags) {
      validateTags(req.body.tags);
    }

    if (req.body.isPublic !== undefined) {
      validateIsPublic(req.body.isPublic);
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Validate content update request
 */
export function validateContentUpdate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const updateData = req.body;

    // Validate that at least one field is being updated
    const allowedFields = ['title', 'description', 'tags', 'isPublic'];
    const providedFields = Object.keys(updateData).filter(key => 
      allowedFields.includes(key)
    );

    if (providedFields.length === 0) {
      throw new ValidationError('At least one field must be provided for update', {
        code: 'NO_UPDATE_FIELDS',
        allowedFields,
      });
    }

    // Validate individual fields if provided
    if (updateData.title !== undefined) {
      validateTitle(updateData.title);
    }

    if (updateData.description !== undefined) {
      validateDescription(updateData.description);
    }

    if (updateData.tags !== undefined) {
      validateTags(updateData.tags);
    }

    if (updateData.isPublic !== undefined) {
      validateIsPublic(updateData.isPublic);
    }

    // Remove any fields that aren't allowed to be updated
    const filteredData: any = {};
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    });

    req.body = filteredData;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Validate transcode request
 */
export function validateTranscodeRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const { resolution, bitrate, codec, format } = req.body;

    // Validate resolution if provided
    if (resolution) {
      const resolutionPattern = /^\d+x\d+$/;
      if (!resolutionPattern.test(resolution)) {
        throw new ValidationError('Invalid resolution format. Expected format: WIDTHxHEIGHT (e.g., 1920x1080)', {
          field: 'resolution',
          code: 'INVALID_RESOLUTION_FORMAT',
          expected: 'WIDTHxHEIGHT',
          actual: resolution,
        });
      }

      const [width, height] = resolution.split('x').map(Number);
      if (width > 4096 || height > 4096) {
        throw new ValidationError('Resolution exceeds maximum allowed (4096x4096)', {
          field: 'resolution',
          code: 'RESOLUTION_TOO_HIGH',
          maxWidth: 4096,
          maxHeight: 4096,
          requestedWidth: width,
          requestedHeight: height,
        });
      }
    }

    // Validate bitrate if provided
    if (bitrate) {
      const bitratePattern = /^\d+k$/;
      if (!bitratePattern.test(bitrate)) {
        throw new ValidationError('Invalid bitrate format. Expected format: NUMBER + "k" (e.g., 2000k)', {
          field: 'bitrate',
          code: 'INVALID_BITRATE_FORMAT',
          expected: 'NUMBERk',
          actual: bitrate,
        });
      }

      const bitrateValue = parseInt(bitrate.replace('k', ''));
      if (bitrateValue > 50000) {
        throw new ValidationError('Bitrate exceeds maximum allowed (50000k)', {
          field: 'bitrate',
          code: 'BITRATE_TOO_HIGH',
          maxBitrate: 50000,
          requestedBitrate: bitrateValue,
        });
      }
    }

    // Validate codec if provided
    if (codec) {
      const allowedCodecs = ['libx264', 'libx265', 'vp8', 'vp9', 'av1'];
      if (!allowedCodecs.includes(codec)) {
        throw new ValidationError(`Unsupported codec: ${codec}`, {
          field: 'codec',
          code: 'INVALID_CODEC',
          allowedCodecs,
          actualCodec: codec,
        });
      }
    }

    // Validate format if provided
    if (format) {
      const allowedFormats = ['mp4', 'webm', 'avi'];
      if (!allowedFormats.includes(format)) {
        throw new ValidationError(`Unsupported format: ${format}`, {
          field: 'format',
          code: 'INVALID_FORMAT',
          allowedFormats,
          actualFormat: format,
        });
      }
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Individual field validation functions
 */

function validateTitle(title: any): void {
  if (typeof title !== 'string') {
    throw new ValidationError('Title must be a string', {
      field: 'title',
      code: 'INVALID_TYPE',
      expected: 'string',
      actual: typeof title,
    });
  }

  if (title.trim().length === 0) {
    throw new ValidationError('Title cannot be empty', {
      field: 'title',
      code: 'EMPTY_VALUE',
    });
  }

  if (title.length > 255) {
    throw new ValidationError('Title cannot exceed 255 characters', {
      field: 'title',
      code: 'VALUE_TOO_LONG',
      maxLength: 255,
      actualLength: title.length,
    });
  }
}

function validateDescription(description: any): void {
  if (description !== null && typeof description !== 'string') {
    throw new ValidationError('Description must be a string or null', {
      field: 'description',
      code: 'INVALID_TYPE',
      expected: 'string | null',
      actual: typeof description,
    });
  }

  if (typeof description === 'string' && description.length > 2000) {
    throw new ValidationError('Description cannot exceed 2000 characters', {
      field: 'description',
      code: 'VALUE_TOO_LONG',
      maxLength: 2000,
      actualLength: description.length,
    });
  }
}

function validateTags(tags: any): void {
  if (!Array.isArray(tags)) {
    throw new ValidationError('Tags must be an array', {
      field: 'tags',
      code: 'INVALID_TYPE',
      expected: 'array',
      actual: typeof tags,
    });
  }

  if (tags.length > 10) {
    throw new ValidationError('Maximum 10 tags allowed', {
      field: 'tags',
      code: 'TOO_MANY_ITEMS',
      maxItems: 10,
      actualItems: tags.length,
    });
  }

  for (const [index, tag] of tags.entries()) {
    if (typeof tag !== 'string') {
      throw new ValidationError(`Tag at index ${index} must be a string`, {
        field: `tags[${index}]`,
        code: 'INVALID_TYPE',
        expected: 'string',
        actual: typeof tag,
      });
    }

    if (tag.trim().length === 0) {
      throw new ValidationError(`Tag at index ${index} cannot be empty`, {
        field: `tags[${index}]`,
        code: 'EMPTY_VALUE',
      });
    }

    if (tag.length > 50) {
      throw new ValidationError(`Tag at index ${index} cannot exceed 50 characters`, {
        field: `tags[${index}]`,
        code: 'VALUE_TOO_LONG',
        maxLength: 50,
        actualLength: tag.length,
      });
    }
  }
}

function validateIsPublic(isPublic: any): void {
  if (typeof isPublic !== 'boolean') {
    throw new ValidationError('isPublic must be a boolean', {
      field: 'isPublic',
      code: 'INVALID_TYPE',
      expected: 'boolean',
      actual: typeof isPublic,
    });
  }
}
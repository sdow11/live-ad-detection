import Joi from 'joi';
import { ContentType, ContentStatus } from '@/models/Content';

/**
 * Content Validation Module
 * 
 * Single Responsibility: Validate content-related data
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate content creation data
 */
export function validateContentCreate(data: any): ValidationResult {
  const schema = Joi.object({
    title: Joi.string()
      .min(1)
      .max(255)
      .trim()
      .required()
      .messages({
        'string.empty': 'Title is required',
        'string.min': 'Title must be at least 1 character long',
        'string.max': 'Title must not exceed 255 characters',
        'any.required': 'Title is required',
      }),

    description: Joi.string()
      .max(2000)
      .trim()
      .allow('')
      .optional()
      .messages({
        'string.max': 'Description must not exceed 2000 characters',
      }),

    tags: Joi.alternatives()
      .try(
        Joi.array().items(
          Joi.string()
            .min(1)
            .max(50)
            .trim()
            .pattern(/^[a-zA-Z0-9\-_]+$/)
            .messages({
              'string.min': 'Tag must be at least 1 character long',
              'string.max': 'Tag must not exceed 50 characters',
              'string.pattern.base': 'Tags can only contain letters, numbers, hyphens, and underscores',
            })
        ).max(10),
        Joi.string().custom((value, helpers) => {
          try {
            const parsed = JSON.parse(value);
            if (!Array.isArray(parsed)) {
              return helpers.error('any.invalid');
            }
            return parsed;
          } catch {
            return helpers.error('any.invalid');
          }
        })
      )
      .optional()
      .messages({
        'array.max': 'Maximum 10 tags allowed',
        'any.invalid': 'Tags must be a valid JSON array',
      }),

    isPublic: Joi.boolean()
      .optional()
      .default(false),
  });

  const { error } = schema.validate(data, { abortEarly: false });

  if (error) {
    return {
      isValid: false,
      errors: error.details.map(detail => detail.message),
    };
  }

  return { isValid: true, errors: [] };
}

/**
 * Validate content update data
 */
export function validateContentUpdate(data: any): ValidationResult {
  const schema = Joi.object({
    title: Joi.string()
      .min(1)
      .max(255)
      .trim()
      .optional()
      .messages({
        'string.empty': 'Title cannot be empty',
        'string.min': 'Title must be at least 1 character long',
        'string.max': 'Title must not exceed 255 characters',
      }),

    description: Joi.string()
      .max(2000)
      .trim()
      .allow('')
      .optional()
      .messages({
        'string.max': 'Description must not exceed 2000 characters',
      }),

    tags: Joi.array()
      .items(
        Joi.string()
          .min(1)
          .max(50)
          .trim()
          .pattern(/^[a-zA-Z0-9\-_]+$/)
          .messages({
            'string.min': 'Tag must be at least 1 character long',
            'string.max': 'Tag must not exceed 50 characters',
            'string.pattern.base': 'Tags can only contain letters, numbers, hyphens, and underscores',
          })
      )
      .max(10)
      .optional()
      .messages({
        'array.max': 'Maximum 10 tags allowed',
      }),

    isPublic: Joi.boolean()
      .optional(),
  }).min(1); // At least one field must be provided

  const { error } = schema.validate(data, { abortEarly: false });

  if (error) {
    return {
      isValid: false,
      errors: error.details.map(detail => detail.message),
    };
  }

  return { isValid: true, errors: [] };
}

/**
 * Validate content filter parameters
 */
export function validateContentFilter(data: any): ValidationResult {
  const schema = Joi.object({
    contentType: Joi.string()
      .valid(...Object.values(ContentType))
      .optional()
      .messages({
        'any.only': `Content type must be one of: ${Object.values(ContentType).join(', ')}`,
      }),

    status: Joi.string()
      .valid(...Object.values(ContentStatus))
      .optional()
      .messages({
        'any.only': `Status must be one of: ${Object.values(ContentStatus).join(', ')}`,
      }),

    isPublic: Joi.string()
      .valid('true', 'false')
      .optional(),

    tags: Joi.string()
      .pattern(/^[a-zA-Z0-9\-_,]+$/)
      .optional()
      .messages({
        'string.pattern.base': 'Tags must be comma-separated alphanumeric values',
      }),

    search: Joi.string()
      .min(1)
      .max(100)
      .trim()
      .optional()
      .messages({
        'string.min': 'Search query must be at least 1 character long',
        'string.max': 'Search query must not exceed 100 characters',
      }),

    limit: Joi.string()
      .pattern(/^\d+$/)
      .custom((value, helpers) => {
        const num = parseInt(value);
        if (num < 1 || num > 100) {
          return helpers.error('number.range');
        }
        return num;
      })
      .optional()
      .messages({
        'string.pattern.base': 'Limit must be a positive integer',
        'number.range': 'Limit must be between 1 and 100',
      }),

    offset: Joi.string()
      .pattern(/^\d+$/)
      .custom((value, helpers) => {
        const num = parseInt(value);
        if (num < 0) {
          return helpers.error('number.min');
        }
        return num;
      })
      .optional()
      .messages({
        'string.pattern.base': 'Offset must be a non-negative integer',
        'number.min': 'Offset must be 0 or greater',
      }),

    sortBy: Joi.string()
      .valid('createdAt', 'updatedAt', 'title', 'fileSize')
      .optional()
      .messages({
        'any.only': 'Sort by must be one of: createdAt, updatedAt, title, fileSize',
      }),

    sortOrder: Joi.string()
      .valid('asc', 'desc')
      .optional()
      .messages({
        'any.only': 'Sort order must be either asc or desc',
      }),
  });

  const { error } = schema.validate(data, { abortEarly: false });

  if (error) {
    return {
      isValid: false,
      errors: error.details.map(detail => detail.message),
    };
  }

  return { isValid: true, errors: [] };
}

/**
 * Validate file upload parameters
 */
export function validateFileUpload(file: Express.Multer.File | undefined): ValidationResult {
  const errors: string[] = [];

  if (!file) {
    errors.push('File is required');
    return { isValid: false, errors };
  }

  // File size validation (2GB max)
  const maxSize = 2 * 1024 * 1024 * 1024; // 2GB in bytes
  if (file.size > maxSize) {
    errors.push('File size must not exceed 2GB');
  }

  // File type validation
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

  if (!allowedTypes.includes(file.mimetype)) {
    errors.push(`Unsupported file type: ${file.mimetype}. Allowed types: ${allowedTypes.join(', ')}`);
  }

  // Original filename validation
  if (!file.originalname || file.originalname.trim().length === 0) {
    errors.push('Original filename is required');
  }

  if (file.originalname && file.originalname.length > 255) {
    errors.push('Filename must not exceed 255 characters');
  }

  // File extension validation
  const allowedExtensions = ['.mp4', '.mov', '.avi', '.webm', '.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const fileExtension = file.originalname ? file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0] : null;
  
  if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
    errors.push(`Unsupported file extension. Allowed extensions: ${allowedExtensions.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate content ID parameter
 */
export function validateContentId(id: any): ValidationResult {
  const schema = Joi.string()
    .guid({ version: 'uuidv4' })
    .required()
    .messages({
      'string.guid': 'Content ID must be a valid UUID',
      'any.required': 'Content ID is required',
    });

  const { error } = schema.validate(id);

  if (error) {
    return {
      isValid: false,
      errors: error.details.map(detail => detail.message),
    };
  }

  return { isValid: true, errors: [] };
}
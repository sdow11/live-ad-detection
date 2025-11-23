/**
 * Custom Error Classes
 * 
 * Application-specific error types for better error handling
 */

export class ModelError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: any;

  constructor(message: string, code: string, statusCode: number = 500, details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    
    // Restore prototype chain
    Object.setPrototypeOf(this, ModelError.prototype);
  }
}

export class ValidationError extends ModelError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NotFoundError extends ModelError {
  constructor(message: string, details?: any) {
    super(message, 'NOT_FOUND', 404, details);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class DownloadError extends ModelError {
  constructor(message: string, details?: any) {
    super(message, 'DOWNLOAD_ERROR', 500, details);
    Object.setPrototypeOf(this, DownloadError.prototype);
  }
}

export class InstallationError extends ModelError {
  constructor(message: string, details?: any) {
    super(message, 'INSTALLATION_ERROR', 500, details);
    Object.setPrototypeOf(this, InstallationError.prototype);
  }
}

export class RegistryError extends ModelError {
  constructor(message: string, details?: any) {
    super(message, 'REGISTRY_ERROR', 503, details);
    Object.setPrototypeOf(this, RegistryError.prototype);
  }
}

export class ChecksumError extends ModelError {
  constructor(message: string, details?: any) {
    super(message, 'CHECKSUM_ERROR', 400, details);
    Object.setPrototypeOf(this, ChecksumError.prototype);
  }
}

export class IncompatibleModelError extends ModelError {
  constructor(message: string, details?: any) {
    super(message, 'INCOMPATIBLE_MODEL', 400, details);
    Object.setPrototypeOf(this, IncompatibleModelError.prototype);
  }
}

export class StorageError extends ModelError {
  constructor(message: string, details?: any) {
    super(message, 'STORAGE_ERROR', 500, details);
    Object.setPrototypeOf(this, StorageError.prototype);
  }
}

export class AuthenticationError extends ModelError {
  constructor(message: string, details?: any) {
    super(message, 'AUTHENTICATION_ERROR', 401, details);
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class AuthorizationError extends ModelError {
  constructor(message: string, details?: any) {
    super(message, 'AUTHORIZATION_ERROR', 403, details);
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

export class RateLimitError extends ModelError {
  constructor(message: string, details?: any) {
    super(message, 'RATE_LIMIT_ERROR', 429, details);
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

export class ConfigurationError extends ModelError {
  constructor(message: string, details?: any) {
    super(message, 'CONFIGURATION_ERROR', 500, details);
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}
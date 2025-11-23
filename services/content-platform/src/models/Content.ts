/**
 * Content Domain Model
 * 
 * Single Responsibility: Represents content entity and its business rules
 */
export class Content {
  public readonly id: string;
  public readonly userId: string;
  public readonly fileName: string;
  public readonly originalFileName: string;
  public readonly mimeType: string;
  public readonly fileSize: number;
  public readonly filePath: string;
  public readonly thumbnailPath?: string;
  public readonly title: string;
  public readonly description?: string;
  public readonly tags: string[];
  public readonly contentType: ContentType;
  public readonly duration?: number; // seconds for video content
  public readonly width?: number;
  public readonly height?: number;
  public readonly metadata: ContentMetadata;
  public readonly status: ContentStatus;
  public readonly isPublic: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly deletedAt?: Date;

  constructor(data: ContentData) {
    // Validation
    this.validateContentData(data);

    this.id = data.id;
    this.userId = data.userId;
    this.fileName = data.fileName;
    this.originalFileName = data.originalFileName;
    this.mimeType = data.mimeType;
    this.fileSize = data.fileSize;
    this.filePath = data.filePath;
    this.thumbnailPath = data.thumbnailPath;
    this.title = data.title;
    this.description = data.description;
    this.tags = data.tags || [];
    this.contentType = data.contentType;
    this.duration = data.duration;
    this.width = data.width;
    this.height = data.height;
    this.metadata = data.metadata || {};
    this.status = data.status || ContentStatus.PROCESSING;
    this.isPublic = data.isPublic || false;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.deletedAt = data.deletedAt;
  }

  /**
   * Check if content is deleted (soft delete)
   */
  public isDeleted(): boolean {
    return this.deletedAt !== undefined;
  }

  /**
   * Check if content is ready for use
   */
  public isReady(): boolean {
    return this.status === ContentStatus.READY;
  }

  /**
   * Check if content is being processed
   */
  public isProcessing(): boolean {
    return this.status === ContentStatus.PROCESSING;
  }

  /**
   * Get human-readable file size
   */
  public getFormattedFileSize(): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = this.fileSize;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Get content duration formatted as HH:MM:SS
   */
  public getFormattedDuration(): string | null {
    if (!this.duration) return null;

    const hours = Math.floor(this.duration / 3600);
    const minutes = Math.floor((this.duration % 3600) / 60);
    const seconds = Math.floor(this.duration % 60);

    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  private validateContentData(data: ContentData): void {
    if (!data.id) throw new Error('Content ID is required');
    if (!data.userId) throw new Error('User ID is required');
    if (!data.fileName) throw new Error('File name is required');
    if (!data.originalFileName) throw new Error('Original file name is required');
    if (!data.mimeType) throw new Error('MIME type is required');
    if (!data.fileSize || data.fileSize <= 0) throw new Error('Valid file size is required');
    if (!data.filePath) throw new Error('File path is required');
    if (!data.title || data.title.trim().length === 0) throw new Error('Title is required');
    if (!Object.values(ContentType).includes(data.contentType)) {
      throw new Error('Valid content type is required');
    }
  }
}

export enum ContentType {
  VIDEO = 'video',
  IMAGE = 'image',
  PLAYLIST = 'playlist',
}

export enum ContentStatus {
  PROCESSING = 'processing',
  READY = 'ready',
  ERROR = 'error',
  DELETED = 'deleted',
}

export interface ContentData {
  id: string;
  userId: string;
  fileName: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  filePath: string;
  thumbnailPath?: string;
  title: string;
  description?: string;
  tags?: string[];
  contentType: ContentType;
  duration?: number;
  width?: number;
  height?: number;
  metadata?: ContentMetadata;
  status?: ContentStatus;
  isPublic?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

export interface ContentMetadata {
  [key: string]: any;
  bitrate?: number;
  codec?: string;
  fps?: number;
  aspectRatio?: string;
  uploadedFrom?: string;
  processingInfo?: {
    thumbnailGenerated?: boolean;
    transcoded?: boolean;
    validated?: boolean;
  };
}

export interface ContentCreateDto {
  title: string;
  description?: string;
  tags?: string[];
  isPublic?: boolean;
}

export interface ContentUpdateDto {
  title?: string;
  description?: string;
  tags?: string[];
  isPublic?: boolean;
}

export interface ContentFilter {
  contentType?: ContentType;
  status?: ContentStatus;
  isPublic?: boolean;
  tags?: string[];
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'fileSize';
  sortOrder?: 'asc' | 'desc';
}
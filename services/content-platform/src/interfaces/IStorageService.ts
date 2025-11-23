/**
 * File Storage Service Interface
 * 
 * Single Responsibility: File storage operations
 * Interface Segregation: Storage-specific operations only
 */
export interface IStorageService {
  /**
   * Upload file to storage
   */
  uploadFile(
    file: Express.Multer.File,
    destination: string
  ): Promise<UploadResult>;

  /**
   * Delete file from storage
   */
  deleteFile(filePath: string): Promise<boolean>;

  /**
   * Get file URL
   */
  getFileUrl(filePath: string): Promise<string>;

  /**
   * Check if file exists
   */
  fileExists(filePath: string): Promise<boolean>;

  /**
   * Get file metadata
   */
  getFileMetadata(filePath: string): Promise<FileMetadata>;
}

export interface UploadResult {
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
}

export interface FileMetadata {
  size: number;
  mimeType: string;
  lastModified: Date;
  etag?: string;
}
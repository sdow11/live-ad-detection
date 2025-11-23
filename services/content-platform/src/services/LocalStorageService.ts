import fs from 'fs/promises';
import path from 'path';
import { IStorageService, UploadResult, FileMetadata } from '@/interfaces/IStorageService';
import { InternalServerError, NotFoundError } from '@/utils/errors';

/**
 * Local File System Storage Service
 * 
 * Single Responsibility: Handle local file storage operations
 * Open/Closed: Can be extended for different storage backends
 * Liskov Substitution: Implements IStorageService contract
 * Interface Segregation: Only implements storage-related operations
 * Dependency Inversion: Depends on file system abstractions
 */
export class LocalStorageService implements IStorageService {
  private readonly basePath: string;
  private readonly baseUrl: string;

  constructor(
    basePath: string = process.env.STORAGE_PATH || '/tmp/uploads',
    baseUrl: string = process.env.STORAGE_URL || 'http://localhost:3000/files'
  ) {
    this.basePath = basePath;
    this.baseUrl = baseUrl;
  }

  /**
   * Upload file to local storage
   */
  async uploadFile(file: Express.Multer.File, destination: string): Promise<UploadResult> {
    try {
      const fullPath = path.join(this.basePath, destination);
      const directory = path.dirname(fullPath);

      // Ensure directory exists
      await this.ensureDirectoryExists(directory);

      // Write file to disk
      await fs.writeFile(fullPath, file.buffer);

      // Verify file was written correctly
      const stats = await fs.stat(fullPath);
      if (stats.size !== file.size) {
        throw new Error('File size mismatch after upload');
      }

      return {
        filePath: destination,
        fileName: path.basename(destination),
        fileSize: stats.size,
        mimeType: file.mimetype,
        url: this.getPublicUrl(destination),
      };
    } catch (error) {
      throw new InternalServerError(
        `Failed to upload file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Delete file from local storage
   */
  async deleteFile(filePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.basePath, filePath);
      
      // Check if file exists
      const exists = await this.fileExists(filePath);
      if (!exists) {
        return false;
      }

      await fs.unlink(fullPath);
      return true;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return false; // File doesn't exist
      }
      throw new InternalServerError(
        `Failed to delete file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get file URL
   */
  async getFileUrl(filePath: string): Promise<string> {
    // Verify file exists
    const exists = await this.fileExists(filePath);
    if (!exists) {
      throw new NotFoundError(`File not found: ${filePath}`);
    }

    return this.getPublicUrl(filePath);
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.basePath, filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(filePath: string): Promise<FileMetadata> {
    try {
      const fullPath = path.join(this.basePath, filePath);
      const stats = await fs.stat(fullPath);

      // Try to determine MIME type from extension
      const mimeType = this.getMimeTypeFromExtension(filePath);

      return {
        size: stats.size,
        mimeType,
        lastModified: stats.mtime,
        etag: `${stats.mtime.getTime()}-${stats.size}`, // Simple ETag generation
      };
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        throw new NotFoundError(`File not found: ${filePath}`);
      }
      throw new InternalServerError(
        `Failed to get file metadata: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Additional utility methods for local storage
   */

  /**
   * Get available disk space
   */
  async getDiskSpace(): Promise<{ free: number; total: number; used: number }> {
    try {
      const stats = await fs.statfs(this.basePath);
      const free = stats.bavail * stats.bsize;
      const total = stats.blocks * stats.bsize;
      const used = total - free;

      return { free, total, used };
    } catch (error) {
      throw new InternalServerError(
        `Failed to get disk space: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Clean up old files (older than specified days)
   */
  async cleanupOldFiles(olderThanDays: number = 30): Promise<number> {
    try {
      let deletedCount = 0;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      await this.cleanupDirectory(this.basePath, cutoffDate, deletedCount);
      
      return deletedCount;
    } catch (error) {
      throw new InternalServerError(
        `Failed to cleanup old files: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    diskSpace: { free: number; total: number; used: number };
  }> {
    try {
      const diskSpace = await this.getDiskSpace();
      const { totalFiles, totalSize } = await this.calculateDirectoryStats(this.basePath);

      return {
        totalFiles,
        totalSize,
        diskSpace,
      };
    } catch (error) {
      throw new InternalServerError(
        `Failed to get storage stats: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Private helper methods
   */

  private async ensureDirectoryExists(directory: string): Promise<void> {
    try {
      await fs.access(directory);
    } catch {
      // Directory doesn't exist, create it
      await fs.mkdir(directory, { recursive: true });
    }
  }

  private getPublicUrl(filePath: string): string {
    return `${this.baseUrl}/${filePath.replace(/\\\\/g, '/')}`;
  }

  private getMimeTypeFromExtension(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.webm': 'video/webm',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.json': 'application/json',
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }

  private async cleanupDirectory(
    directory: string, 
    cutoffDate: Date, 
    deletedCount: number
  ): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      
      if (entry.isDirectory()) {
        await this.cleanupDirectory(fullPath, cutoffDate, deletedCount);
      } else {
        const stats = await fs.stat(fullPath);
        if (stats.mtime < cutoffDate) {
          await fs.unlink(fullPath);
          deletedCount++;
        }
      }
    }
  }

  private async calculateDirectoryStats(
    directory: string
  ): Promise<{ totalFiles: number; totalSize: number }> {
    let totalFiles = 0;
    let totalSize = 0;

    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        
        if (entry.isDirectory()) {
          const subStats = await this.calculateDirectoryStats(fullPath);
          totalFiles += subStats.totalFiles;
          totalSize += subStats.totalSize;
        } else {
          const stats = await fs.stat(fullPath);
          totalFiles++;
          totalSize += stats.size;
        }
      }
    } catch (error) {
      // Directory might not exist or be accessible
      console.warn(`Could not access directory ${directory}: ${error}`);
    }

    return { totalFiles, totalSize };
  }
}
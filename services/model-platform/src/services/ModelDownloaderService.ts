import fs from 'fs/promises';
import path from 'path';
import * as crypto from 'crypto';
import axios, { AxiosResponse } from 'axios';
import { 
  IModelDownloader, 
  DownloadProgress, 
  DownloadStatus, 
  DownloadOptions, 
  DownloadResult, 
  DownloadTask 
} from '@/interfaces/IModelDownloader';
import { DownloadError } from '@/utils/errors';
import { v4 as uuidv4 } from 'uuid';

/**
 * Model Downloader Service Implementation
 * 
 * Single Responsibility: Handle model file downloads and verification
 * Open/Closed: Extensible for different download sources and protocols
 * Liskov Substitution: Implements IModelDownloader contract
 * Interface Segregation: Only download-related operations
 * Dependency Inversion: Depends on file system and HTTP abstractions
 */
export class ModelDownloaderService implements IModelDownloader {
  private readonly cachePath: string;
  private readonly activeTasks: Map<string, DownloadTask> = new Map();
  private readonly downloadStats = {
    totalDownloads: 0,
    successfulDownloads: 0,
    failedDownloads: 0,
    totalBytesDownloaded: 0,
    totalDownloadTime: 0,
  };

  constructor(cachePath: string = process.env.MODEL_CACHE_PATH || '/tmp/models') {
    this.cachePath = cachePath;
  }

  /**
   * Download a model file from URL to local path
   */
  async downloadModel(
    url: string,
    destinationPath: string,
    options: DownloadOptions = {}
  ): Promise<DownloadResult> {
    const startTime = Date.now();
    const taskId = uuidv4();

    try {
      // Initialize download task
      const task: DownloadTask = {
        id: taskId,
        url,
        destinationPath,
        startedAt: new Date(),
        progress: {
          totalBytes: 0,
          downloadedBytes: 0,
          percentage: 0,
          speed: 0,
          estimatedTimeRemaining: 0,
          status: DownloadStatus.PENDING,
        },
      };

      this.activeTasks.set(taskId, task);
      this.downloadStats.totalDownloads++;

      // Configure axios options
      const axiosConfig = {
        timeout: options.timeout || 300000, // 5 minutes default
        responseType: 'arraybuffer' as const,
        headers: options.headers || {},
        onDownloadProgress: (progressEvent: any) => {
          if (progressEvent.total) {
            const downloaded = progressEvent.loaded;
            const total = progressEvent.total;
            const percentage = Math.round((downloaded / total) * 100);
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = downloaded / elapsed;
            const remainingBytes = total - downloaded;
            const eta = speed > 0 ? remainingBytes / speed : 0;

            task.progress = {
              totalBytes: total,
              downloadedBytes: downloaded,
              percentage,
              speed,
              estimatedTimeRemaining: eta,
              status: DownloadStatus.IN_PROGRESS,
            };

            // Call progress callback if provided
            if (options.onProgress) {
              options.onProgress(task.progress);
            }
          }
        },
      };

      // Attempt download with retries
      const maxRetries = options.retries || 3;
      const retryDelay = options.retryDelay || 1000;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          task.progress.status = DownloadStatus.IN_PROGRESS;
          
          // Ensure destination directory exists
          await this.ensureDirectoryExists(path.dirname(destinationPath));
          
          const response: AxiosResponse = await axios.get(url, axiosConfig);
          
          // Write file to disk
          await fs.writeFile(destinationPath, Buffer.from(response.data));

          // Verify file was written correctly
          const stats = await fs.stat(destinationPath);
          const fileSize = stats.size;

          // Calculate checksum
          const checksum = await this.calculateChecksum(destinationPath);

          // Update task completion
          task.progress.status = DownloadStatus.COMPLETED;
          task.progress.percentage = 100;
          task.completedAt = new Date();

          // Update stats
          this.downloadStats.successfulDownloads++;
          this.downloadStats.totalBytesDownloaded += fileSize;
          this.downloadStats.totalDownloadTime += (Date.now() - startTime);

          // Final progress callback
          if (options.onProgress) {
            options.onProgress(task.progress);
          }

          // Clean up task
          this.activeTasks.delete(taskId);

          return {
            success: true,
            filePath: destinationPath,
            fileSize,
            duration: Date.now() - startTime,
            checksum,
          };
        } catch (error) {
          lastError = error as Error;
          
          if (attempt < maxRetries) {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
          }
        }
      }

      // All retries failed
      task.progress.status = DownloadStatus.FAILED;
      task.error = lastError?.message || 'Download failed';
      this.downloadStats.failedDownloads++;
      
      // Clean up task
      this.activeTasks.delete(taskId);

      return {
        success: false,
        error: `Download failed after ${maxRetries + 1} attempts: ${lastError?.message}`,
        duration: Date.now() - startTime,
      };

    } catch (error) {
      // Clean up task
      this.activeTasks.delete(taskId);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Download multiple models concurrently
   */
  async downloadBatch(
    downloads: Array<{ url: string; destinationPath: string; options?: DownloadOptions }>
  ): Promise<DownloadResult[]> {
    const maxConcurrent = downloads[0]?.options?.maxConcurrent || 3;
    const results: DownloadResult[] = [];

    // Process downloads in batches to respect concurrency limit
    for (let i = 0; i < downloads.length; i += maxConcurrent) {
      const batch = downloads.slice(i, i + maxConcurrent);
      const batchPromises = batch.map(download =>
        this.downloadModel(download.url, download.destinationPath, download.options)
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Resume a paused download (placeholder implementation)
   */
  async resumeDownload(taskId: string): Promise<DownloadResult> {
    const task = this.activeTasks.get(taskId);
    
    if (!task) {
      throw new DownloadError(`Download task not found: ${taskId}`);
    }

    if (task.progress.status !== DownloadStatus.PAUSED) {
      throw new DownloadError(`Task ${taskId} is not paused`);
    }

    // For now, restart the download - full resume would require Range header support
    return this.downloadModel(task.url, task.destinationPath);
  }

  /**
   * Pause an active download
   */
  async pauseDownload(taskId: string): Promise<boolean> {
    const task = this.activeTasks.get(taskId);
    
    if (!task) {
      return false;
    }

    if (task.progress.status === DownloadStatus.IN_PROGRESS) {
      task.progress.status = DownloadStatus.PAUSED;
      return true;
    }

    return false;
  }

  /**
   * Cancel an active download
   */
  async cancelDownload(taskId: string): Promise<boolean> {
    const task = this.activeTasks.get(taskId);
    
    if (!task) {
      return false;
    }

    task.progress.status = DownloadStatus.CANCELLED;
    this.activeTasks.delete(taskId);
    
    // Attempt to clean up partial file
    try {
      await fs.unlink(task.destinationPath);
    } catch {
      // Ignore cleanup errors
    }

    return true;
  }

  /**
   * Get progress of active downloads
   */
  async getDownloadProgress(taskId: string): Promise<DownloadProgress | null> {
    const task = this.activeTasks.get(taskId);
    return task ? task.progress : null;
  }

  /**
   * Get all active download tasks
   */
  async getActiveTasks(): Promise<DownloadTask[]> {
    return Array.from(this.activeTasks.values());
  }

  /**
   * Verify download integrity using checksum
   */
  async verifyDownload(filePath: string, expectedChecksum: string): Promise<boolean> {
    try {
      const actualChecksum = await this.calculateChecksum(filePath);
      return actualChecksum.toLowerCase() === expectedChecksum.toLowerCase();
    } catch (error) {
      throw new DownloadError(
        `Failed to verify download: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get download statistics
   */
  async getDownloadStats(): Promise<{
    totalDownloads: number;
    successfulDownloads: number;
    failedDownloads: number;
    totalBytesDownloaded: number;
    averageSpeed: number;
  }> {
    const averageSpeed = this.downloadStats.totalDownloadTime > 0
      ? (this.downloadStats.totalBytesDownloaded * 1000) / this.downloadStats.totalDownloadTime
      : 0;

    return {
      ...this.downloadStats,
      averageSpeed,
    };
  }

  /**
   * Clean up completed/failed download tasks
   */
  async cleanupTasks(): Promise<void> {
    const completedStatuses = [
      DownloadStatus.COMPLETED,
      DownloadStatus.FAILED,
      DownloadStatus.CANCELLED,
    ];

    for (const [taskId, task] of this.activeTasks.entries()) {
      if (completedStatuses.includes(task.progress.status)) {
        this.activeTasks.delete(taskId);
      }
    }
  }

  /**
   * Private helper methods
   */

  private async ensureDirectoryExists(directory: string): Promise<void> {
    try {
      await fs.access(directory);
    } catch {
      await fs.mkdir(directory, { recursive: true });
    }
  }

  private async calculateChecksum(filePath: string, algorithm: string = 'sha256'): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    const hash = crypto.createHash(algorithm);
    hash.update(fileBuffer);
    return hash.digest('hex');
  }
}
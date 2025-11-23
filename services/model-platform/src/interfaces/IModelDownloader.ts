/**
 * Model Downloader Interface
 * 
 * Defines the contract for downloading AI models from remote sources
 * Following Interface Segregation Principle - focused on download operations
 */

export interface DownloadProgress {
  totalBytes: number;
  downloadedBytes: number;
  percentage: number;
  speed: number; // bytes per second
  estimatedTimeRemaining: number; // seconds
  status: DownloadStatus;
}

export enum DownloadStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PAUSED = 'paused',
}

export interface DownloadOptions {
  timeout?: number; // milliseconds
  retries?: number;
  retryDelay?: number; // milliseconds
  resumeSupport?: boolean;
  onProgress?: (progress: DownloadProgress) => void;
  headers?: Record<string, string>;
  maxConcurrent?: number;
}

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  fileSize?: number;
  duration?: number; // milliseconds
  error?: string;
  checksum?: string;
}

export interface DownloadTask {
  id: string;
  url: string;
  destinationPath: string;
  progress: DownloadProgress;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

/**
 * Model Downloader Interface
 * 
 * Single Responsibility: Handle model file downloads
 * Interface Segregation: Only download-related operations
 */
export interface IModelDownloader {
  /**
   * Download a model file from URL to local path
   */
  downloadModel(
    url: string,
    destinationPath: string,
    options?: DownloadOptions
  ): Promise<DownloadResult>;

  /**
   * Download multiple models concurrently
   */
  downloadBatch(
    downloads: Array<{ url: string; destinationPath: string; options?: DownloadOptions }>
  ): Promise<DownloadResult[]>;

  /**
   * Resume a paused download
   */
  resumeDownload(taskId: string): Promise<DownloadResult>;

  /**
   * Pause an active download
   */
  pauseDownload(taskId: string): Promise<boolean>;

  /**
   * Cancel an active download
   */
  cancelDownload(taskId: string): Promise<boolean>;

  /**
   * Get progress of active downloads
   */
  getDownloadProgress(taskId: string): Promise<DownloadProgress | null>;

  /**
   * Get all active download tasks
   */
  getActiveTasks(): Promise<DownloadTask[]>;

  /**
   * Verify download integrity using checksum
   */
  verifyDownload(filePath: string, expectedChecksum: string): Promise<boolean>;

  /**
   * Get download statistics
   */
  getDownloadStats(): Promise<{
    totalDownloads: number;
    successfulDownloads: number;
    failedDownloads: number;
    totalBytesDownloaded: number;
    averageSpeed: number;
  }>;

  /**
   * Clean up completed/failed download tasks
   */
  cleanupTasks(): Promise<void>;
}
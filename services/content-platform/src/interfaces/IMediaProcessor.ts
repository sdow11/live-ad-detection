/**
 * Media Processing Service Interface
 * 
 * Single Responsibility: Media file processing operations
 * Interface Segregation: Processing-specific operations only
 */
export interface IMediaProcessor {
  /**
   * Generate thumbnail for video content
   */
  generateVideoThumbnail(
    inputPath: string,
    outputPath: string,
    options?: VideoThumbnailOptions
  ): Promise<ProcessingResult>;

  /**
   * Generate thumbnail for image content
   */
  generateImageThumbnail(
    inputPath: string,
    outputPath: string,
    options?: ImageThumbnailOptions
  ): Promise<ProcessingResult>;

  /**
   * Get media metadata (duration, resolution, codec, etc.)
   */
  getMediaMetadata(filePath: string): Promise<MediaMetadata>;

  /**
   * Validate media file format
   */
  validateMediaFile(filePath: string): Promise<ValidationResult>;

  /**
   * Transcode video to different formats/qualities
   */
  transcodeVideo(
    inputPath: string,
    outputPath: string,
    options: TranscodeOptions
  ): Promise<ProcessingResult>;
}

export interface VideoThumbnailOptions {
  timeOffset?: number; // seconds
  width?: number;
  height?: number;
  quality?: number; // 1-100
}

export interface ImageThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number; // 1-100
  format?: 'jpeg' | 'png' | 'webp';
}

export interface TranscodeOptions {
  resolution?: string; // '1920x1080', '1280x720', etc.
  bitrate?: string; // '2000k', '5000k', etc.
  codec?: string; // 'h264', 'h265', etc.
  format?: string; // 'mp4', 'webm', etc.
}

export interface ProcessingResult {
  success: boolean;
  outputPath?: string;
  duration?: number; // processing time in seconds
  error?: string;
}

export interface MediaMetadata {
  duration?: number; // seconds
  width?: number;
  height?: number;
  bitrate?: number;
  codec?: string;
  format: string;
  size: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  mediaType: 'video' | 'image' | 'unknown';
}
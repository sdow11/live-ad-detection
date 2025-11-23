import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { 
  IMediaProcessor,
  VideoThumbnailOptions,
  ImageThumbnailOptions,
  TranscodeOptions,
  ProcessingResult,
  MediaMetadata,
  ValidationResult
} from '@/interfaces/IMediaProcessor';
import { InternalServerError, ValidationError } from '@/utils/errors';

/**
 * Media Processing Service Implementation
 * 
 * Single Responsibility: Handle media file processing operations
 * Open/Closed: Extensible for different media operations
 * Liskov Substitution: Implements IMediaProcessor contract
 * Interface Segregation: Only media processing operations
 * Dependency Inversion: Depends on ffmpeg and sharp abstractions
 */
export class MediaProcessorService implements IMediaProcessor {
  private readonly ffmpegPath?: string;
  private readonly ffprobePath?: string;

  constructor(
    ffmpegPath?: string,
    ffprobePath?: string
  ) {
    this.ffmpegPath = ffmpegPath || process.env.FFMPEG_PATH;
    this.ffprobePath = ffprobePath || process.env.FFPROBE_PATH;

    // Configure ffmpeg paths if provided
    if (this.ffmpegPath) {
      ffmpeg.setFfmpegPath(this.ffmpegPath);
    }
    if (this.ffprobePath) {
      ffmpeg.setFfprobePath(this.ffprobePath);
    }
  }

  /**
   * Generate thumbnail for video content
   */
  async generateVideoThumbnail(
    inputPath: string,
    outputPath: string,
    options: VideoThumbnailOptions = {}
  ): Promise<ProcessingResult> {
    const startTime = Date.now();

    try {
      // Validate input file exists
      await this.validateInputFile(inputPath);

      // Ensure output directory exists
      await this.ensureOutputDirectory(outputPath);

      const {
        timeOffset = 5,
        width = 320,
        height = 180,
        quality = 80
      } = options;

      return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .screenshots({
            count: 1,
            timemarks: [`${timeOffset}`],
            size: `${width}x${height}`,
            quality: quality,
            filename: path.basename(outputPath),
            folder: path.dirname(outputPath),
          })
          .on('end', () => {
            const duration = (Date.now() - startTime) / 1000;
            resolve({
              success: true,
              outputPath,
              duration,
            });
          })
          .on('error', (error: Error) => {
            reject(new InternalServerError(`Video thumbnail generation failed: ${error.message}`));
          });
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: (Date.now() - startTime) / 1000,
      };
    }
  }

  /**
   * Generate thumbnail for image content
   */
  async generateImageThumbnail(
    inputPath: string,
    outputPath: string,
    options: ImageThumbnailOptions = {}
  ): Promise<ProcessingResult> {
    const startTime = Date.now();

    try {
      // Validate input file exists
      await this.validateInputFile(inputPath);

      // Ensure output directory exists
      await this.ensureOutputDirectory(outputPath);

      const {
        width = 320,
        height = 180,
        quality = 80,
        format = 'jpeg'
      } = options;

      await sharp(inputPath)
        .resize(width, height, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: format === 'jpeg' ? quality : undefined })
        .png({ quality: format === 'png' ? quality : undefined })
        .webp({ quality: format === 'webp' ? quality : undefined })
        .toFile(outputPath);

      const duration = (Date.now() - startTime) / 1000;

      return {
        success: true,
        outputPath,
        duration,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: (Date.now() - startTime) / 1000,
      };
    }
  }

  /**
   * Get media metadata (duration, resolution, codec, etc.)
   */
  async getMediaMetadata(filePath: string): Promise<MediaMetadata> {
    try {
      // Validate input file exists
      await this.validateInputFile(filePath);

      // Get file stats for size
      const stats = await fs.stat(filePath);

      return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (error, metadata) => {
          if (error) {
            reject(new InternalServerError(`Failed to get media metadata: ${error.message}`));
            return;
          }

          try {
            const videoStream = metadata.streams?.find(s => s.codec_type === 'video');
            const audioStream = metadata.streams?.find(s => s.codec_type === 'audio');

            const result: MediaMetadata = {
              format: metadata.format?.format_name || 'unknown',
              size: stats.size,
              duration: metadata.format?.duration ? parseFloat(metadata.format.duration.toString()) : undefined,
              bitrate: metadata.format?.bit_rate ? parseInt(metadata.format.bit_rate.toString()) : undefined,
              width: videoStream?.width,
              height: videoStream?.height,
              codec: videoStream?.codec_name,
            };

            resolve(result);
          } catch (parseError) {
            reject(new InternalServerError(`Failed to parse media metadata: ${parseError}`));
          }
        });
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to get media metadata: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Validate media file format
   */
  async validateMediaFile(filePath: string): Promise<ValidationResult> {
    try {
      // Check if file exists
      await this.validateInputFile(filePath);

      // Get file stats
      const stats = await fs.stat(filePath);
      
      // File size validation
      const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
      if (stats.size > maxSize) {
        return {
          isValid: false,
          errors: ['File size exceeds 2GB limit'],
          mediaType: 'unknown',
        };
      }

      if (stats.size === 0) {
        return {
          isValid: false,
          errors: ['File is empty'],
          mediaType: 'unknown',
        };
      }

      // Try to get metadata to validate format
      try {
        const metadata = await this.getMediaMetadata(filePath);
        
        // Determine media type based on streams
        const mediaType = this.determineMediaType(metadata);
        
        // Additional validation based on media type
        const validationErrors = this.validateMediaTypeSpecific(metadata, mediaType);
        
        return {
          isValid: validationErrors.length === 0,
          errors: validationErrors,
          mediaType,
        };
      } catch (metadataError) {
        // If we can't read metadata, try to determine type from extension
        const extension = path.extname(filePath).toLowerCase();
        const mediaType = this.getMediaTypeFromExtension(extension);
        
        if (mediaType === 'unknown') {
          return {
            isValid: false,
            errors: ['Unsupported file format'],
            mediaType: 'unknown',
          };
        }

        // For image files, try to validate with Sharp
        if (mediaType === 'image') {
          try {
            const imageMetadata = await sharp(filePath).metadata();
            if (!imageMetadata.width || !imageMetadata.height) {
              return {
                isValid: false,
                errors: ['Invalid image file'],
                mediaType: 'image',
              };
            }
            
            return {
              isValid: true,
              errors: [],
              mediaType: 'image',
            };
          } catch (sharpError) {
            return {
              isValid: false,
              errors: ['Corrupted or invalid image file'],
              mediaType: 'image',
            };
          }
        }

        return {
          isValid: false,
          errors: [`Cannot validate media file: ${metadataError}`],
          mediaType,
        };
      }
    } catch (error) {
      return {
        isValid: false,
        errors: [`File validation failed: ${error instanceof Error ? error.message : String(error)}`],
        mediaType: 'unknown',
      };
    }
  }

  /**
   * Transcode video to different formats/qualities
   */
  async transcodeVideo(
    inputPath: string,
    outputPath: string,
    options: TranscodeOptions
  ): Promise<ProcessingResult> {
    const startTime = Date.now();

    try {
      // Validate input file exists
      await this.validateInputFile(inputPath);

      // Ensure output directory exists
      await this.ensureOutputDirectory(outputPath);

      const {
        resolution,
        bitrate,
        codec = 'libx264',
        format = 'mp4'
      } = options;

      return new Promise((resolve, reject) => {
        let command = ffmpeg(inputPath);

        // Set output format
        command = command.format(format);

        // Set video codec
        command = command.videoCodec(codec);

        // Set resolution if specified
        if (resolution) {
          command = command.size(resolution);
        }

        // Set bitrate if specified
        if (bitrate) {
          command = command.videoBitrate(bitrate);
        }

        // Add additional optimizations
        command = command
          .audioCodec('aac')
          .audioChannels(2)
          .audioFrequency(44100)
          .outputOptions([
            '-preset', 'medium',
            '-crf', '23',
            '-movflags', '+faststart', // Optimize for web streaming
          ]);

        command
          .output(outputPath)
          .on('end', () => {
            const duration = (Date.now() - startTime) / 1000;
            resolve({
              success: true,
              outputPath,
              duration,
            });
          })
          .on('error', (error: Error) => {
            reject(new InternalServerError(`Video transcoding failed: ${error.message}`));
          })
          .run();
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: (Date.now() - startTime) / 1000,
      };
    }
  }

  /**
   * Private helper methods
   */

  private async validateInputFile(filePath: string): Promise<void> {
    try {
      await fs.access(filePath);
    } catch {
      throw new ValidationError(`Input file not found: ${filePath}`);
    }
  }

  private async ensureOutputDirectory(outputPath: string): Promise<void> {
    const directory = path.dirname(outputPath);
    try {
      await fs.access(directory);
    } catch {
      await fs.mkdir(directory, { recursive: true });
    }
  }

  private determineMediaType(metadata: MediaMetadata): 'video' | 'image' | 'unknown' {
    if (metadata.duration !== undefined && metadata.duration > 0) {
      return 'video';
    }

    if (metadata.width && metadata.height && !metadata.duration) {
      return 'image';
    }

    // Try to determine from format
    const videoFormats = ['mp4', 'avi', 'mov', 'webm', 'mkv', 'flv'];
    const imageFormats = ['jpeg', 'jpg', 'png', 'gif', 'webp', 'bmp', 'tiff'];

    if (videoFormats.some(format => metadata.format.includes(format))) {
      return 'video';
    }

    if (imageFormats.some(format => metadata.format.includes(format))) {
      return 'image';
    }

    return 'unknown';
  }

  private getMediaTypeFromExtension(extension: string): 'video' | 'image' | 'unknown' {
    const videoExtensions = ['.mp4', '.avi', '.mov', '.webm', '.mkv', '.flv', '.wmv'];
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'];

    if (videoExtensions.includes(extension)) {
      return 'video';
    }

    if (imageExtensions.includes(extension)) {
      return 'image';
    }

    return 'unknown';
  }

  private validateMediaTypeSpecific(metadata: MediaMetadata, mediaType: string): string[] {
    const errors: string[] = [];

    if (mediaType === 'video') {
      // Video-specific validations
      if (metadata.duration && metadata.duration > 24 * 60 * 60) { // 24 hours
        errors.push('Video duration exceeds maximum allowed (24 hours)');
      }

      if (metadata.width && metadata.height) {
        if (metadata.width > 4096 || metadata.height > 4096) {
          errors.push('Video resolution exceeds maximum allowed (4096x4096)');
        }
        
        if (metadata.width < 64 || metadata.height < 64) {
          errors.push('Video resolution is too small (minimum 64x64)');
        }
      }

      if (metadata.bitrate && metadata.bitrate > 50000000) { // 50 Mbps
        errors.push('Video bitrate is too high (maximum 50 Mbps)');
      }
    }

    if (mediaType === 'image') {
      // Image-specific validations
      if (metadata.width && metadata.height) {
        if (metadata.width > 10000 || metadata.height > 10000) {
          errors.push('Image dimensions exceed maximum allowed (10000x10000)');
        }
        
        if (metadata.width < 10 || metadata.height < 10) {
          errors.push('Image dimensions are too small (minimum 10x10)');
        }
      }
    }

    return errors;
  }
}
import fs from 'fs/promises';
import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import { MediaProcessorService } from '@/services/MediaProcessorService';
import { ValidationError, InternalServerError } from '@/utils/errors';

// Mock external dependencies
jest.mock('fs/promises');
jest.mock('fluent-ffmpeg');
jest.mock('sharp');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockFfmpeg = ffmpeg as jest.MockedFunction<typeof ffmpeg>;
const mockSharp = sharp as jest.MockedFunction<typeof sharp>;

describe('MediaProcessorService', () => {
  let mediaProcessor: MediaProcessorService;

  beforeEach(() => {
    mediaProcessor = new MediaProcessorService();
    jest.clearAllMocks();

    // Setup default mocks
    mockFs.access.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue({ size: 1024 } as any);
  });

  describe('generateVideoThumbnail()', () => {
    it('should generate video thumbnail successfully', async () => {
      const inputPath = '/input/video.mp4';
      const outputPath = '/output/thumbnail.jpg';
      const options = { timeOffset: 10, width: 640, height: 360, quality: 90 };

      // Mock ffmpeg chain
      const mockScreenshots = jest.fn().mockReturnThis();
      const mockOn: jest.MockedFunction<any> = jest.fn((event: string, callback: Function): any => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockOn;
      });

      mockFfmpeg.mockReturnValue({
        screenshots: mockScreenshots,
        on: mockOn,
      } as any);

      const result = await mediaProcessor.generateVideoThumbnail(inputPath, outputPath, options);

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe(outputPath);
      expect(result.duration).toBeGreaterThan(0);

      expect(mockScreenshots).toHaveBeenCalledWith({
        count: 1,
        timemarks: ['10'],
        size: '640x360',
        quality: 90,
        filename: 'thumbnail.jpg',
        folder: '/output',
      });
    });

    it('should use default options when none provided', async () => {
      const inputPath = '/input/video.mp4';
      const outputPath = '/output/thumbnail.jpg';

      const mockScreenshots = jest.fn().mockReturnThis();
      const mockOn: jest.MockedFunction<any> = jest.fn((event: string, callback: Function): any => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockOn;
      });

      mockFfmpeg.mockReturnValue({
        screenshots: mockScreenshots,
        on: mockOn,
      } as any);

      await mediaProcessor.generateVideoThumbnail(inputPath, outputPath);

      expect(mockScreenshots).toHaveBeenCalledWith({
        count: 1,
        timemarks: ['5'],
        size: '320x180',
        quality: 80,
        filename: 'thumbnail.jpg',
        folder: '/output',
      });
    });

    it('should handle ffmpeg errors', async () => {
      const inputPath = '/input/video.mp4';
      const outputPath = '/output/thumbnail.jpg';

      const mockScreenshots = jest.fn().mockReturnThis();
      const mockOn: jest.MockedFunction<any> = jest.fn((event: string, callback: Function): any => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('FFmpeg error')), 0);
        }
        return mockOn;
      });

      mockFfmpeg.mockReturnValue({
        screenshots: mockScreenshots,
        on: mockOn,
      } as any);

      const result = await mediaProcessor.generateVideoThumbnail(inputPath, outputPath);

      expect(result.success).toBe(false);
      expect(result.error).toContain('FFmpeg error');
    });

    it('should handle input file not found', async () => {
      const inputPath = '/input/nonexistent.mp4';
      const outputPath = '/output/thumbnail.jpg';

      mockFs.access.mockRejectedValueOnce(new Error('File not found'));

      const result = await mediaProcessor.generateVideoThumbnail(inputPath, outputPath);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Input file not found');
    });
  });

  describe('generateImageThumbnail()', () => {
    it('should generate image thumbnail successfully', async () => {
      const inputPath = '/input/image.jpg';
      const outputPath = '/output/thumbnail.jpg';
      const options = { width: 640, height: 360, quality: 90, format: 'jpeg' as const };

      // Mock Sharp chain
      const mockResize = jest.fn().mockReturnThis();
      const mockJpeg = jest.fn().mockReturnThis();
      const mockPng = jest.fn().mockReturnThis();
      const mockWebp = jest.fn().mockReturnThis();
      const mockToFile = jest.fn().mockResolvedValue(undefined);

      mockSharp.mockReturnValue({
        resize: mockResize,
        jpeg: mockJpeg,
        png: mockPng,
        webp: mockWebp,
        toFile: mockToFile,
      } as any);

      const result = await mediaProcessor.generateImageThumbnail(inputPath, outputPath, options);

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe(outputPath);
      expect(result.duration).toBeGreaterThan(0);

      expect(mockSharp).toHaveBeenCalledWith(inputPath);
      expect(mockResize).toHaveBeenCalledWith(640, 360, {
        fit: 'cover',
        position: 'center',
      });
      expect(mockJpeg).toHaveBeenCalledWith({ quality: 90 });
      expect(mockToFile).toHaveBeenCalledWith(outputPath);
    });

    it('should handle Sharp errors', async () => {
      const inputPath = '/input/image.jpg';
      const outputPath = '/output/thumbnail.jpg';

      mockSharp.mockImplementation(() => {
        throw new Error('Sharp processing error');
      });

      const result = await mediaProcessor.generateImageThumbnail(inputPath, outputPath);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Sharp processing error');
    });

    it('should create output directory if it does not exist', async () => {
      const inputPath = '/input/image.jpg';
      const outputPath = '/new/directory/thumbnail.jpg';

      // First access fails (directory doesn't exist), mkdir should be called
      mockFs.access
        .mockResolvedValueOnce(undefined) // Input file exists
        .mockRejectedValueOnce(new Error('Directory not found')) // Output dir doesn't exist
        .mockResolvedValueOnce(undefined); // After mkdir

      mockFs.mkdir.mockResolvedValue(undefined);

      const mockResize = jest.fn().mockReturnThis();
      const mockJpeg = jest.fn().mockReturnThis();
      const mockPng = jest.fn().mockReturnThis();
      const mockWebp = jest.fn().mockReturnThis();
      const mockToFile = jest.fn().mockResolvedValue(undefined);

      mockSharp.mockReturnValue({
        resize: mockResize,
        jpeg: mockJpeg,
        png: mockPng,
        webp: mockWebp,
        toFile: mockToFile,
      } as any);

      await mediaProcessor.generateImageThumbnail(inputPath, outputPath);

      expect(mockFs.mkdir).toHaveBeenCalledWith('/new/directory', { recursive: true });
    });
  });

  describe('getMediaMetadata()', () => {
    it('should return video metadata', async () => {
      const filePath = '/input/video.mp4';
      const mockMetadata = {
        format: {
          format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
          duration: 120.5,
          bit_rate: 2000000,
        },
        streams: [
          {
            codec_type: 'video',
            codec_name: 'h264',
            width: 1920,
            height: 1080,
          },
          {
            codec_type: 'audio',
            codec_name: 'aac',
          },
        ],
      };

      // Mock ffprobe
      const mockFfprobe = jest.fn((path, callback) => {
        callback(null, mockMetadata);
      });
      mockFfmpeg.ffprobe = mockFfprobe;

      mockFs.stat.mockResolvedValue({ size: 10485760 } as any);

      const result = await mediaProcessor.getMediaMetadata(filePath);

      expect(result).toEqual({
        format: 'mov,mp4,m4a,3gp,3g2,mj2',
        size: 10485760,
        duration: 120.5,
        bitrate: 2000000,
        width: 1920,
        height: 1080,
        codec: 'h264',
      });
    });

    it('should return image metadata', async () => {
      const filePath = '/input/image.jpg';
      const mockMetadata = {
        format: {
          format_name: 'image2',
        },
        streams: [
          {
            codec_type: 'video',
            codec_name: 'mjpeg',
            width: 800,
            height: 600,
          },
        ],
      };

      const mockFfprobe = jest.fn((path, callback) => {
        callback(null, mockMetadata);
      });
      mockFfmpeg.ffprobe = mockFfprobe;

      mockFs.stat.mockResolvedValue({ size: 204800 } as any);

      const result = await mediaProcessor.getMediaMetadata(filePath);

      expect(result).toEqual({
        format: 'image2',
        size: 204800,
        duration: undefined,
        bitrate: undefined,
        width: 800,
        height: 600,
        codec: 'mjpeg',
      });
    });

    it('should handle ffprobe errors', async () => {
      const filePath = '/input/corrupted.mp4';

      const mockFfprobe = jest.fn((path, callback) => {
        callback(new Error('Invalid format'), null);
      });
      mockFfmpeg.ffprobe = mockFfprobe;

      await expect(mediaProcessor.getMediaMetadata(filePath))
        .rejects.toThrow(InternalServerError);
    });
  });

  describe('validateMediaFile()', () => {
    it('should validate valid video file', async () => {
      const filePath = '/input/video.mp4';

      mockFs.stat.mockResolvedValue({ size: 1048576 } as any);

      const mockFfprobe = jest.fn((path, callback) => {
        callback(null, {
          format: { format_name: 'mp4', duration: 120 },
          streams: [{ codec_type: 'video', width: 1920, height: 1080 }],
        });
      });
      mockFfmpeg.ffprobe = mockFfprobe;

      const result = await mediaProcessor.validateMediaFile(filePath);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.mediaType).toBe('video');
    });

    it('should validate valid image file', async () => {
      const filePath = '/input/image.jpg';

      mockFs.stat.mockResolvedValue({ size: 204800 } as any);

      const mockFfprobe = jest.fn((path, callback) => {
        callback(null, {
          format: { format_name: 'image2' },
          streams: [{ codec_type: 'video', width: 800, height: 600 }],
        });
      });
      mockFfmpeg.ffprobe = mockFfprobe;

      const result = await mediaProcessor.validateMediaFile(filePath);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.mediaType).toBe('image');
    });

    it('should reject file that is too large', async () => {
      const filePath = '/input/huge-file.mp4';

      mockFs.stat.mockResolvedValue({ size: 3 * 1024 * 1024 * 1024 } as any); // 3GB

      const result = await mediaProcessor.validateMediaFile(filePath);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File size exceeds 2GB limit');
      expect(result.mediaType).toBe('unknown');
    });

    it('should reject empty file', async () => {
      const filePath = '/input/empty.mp4';

      mockFs.stat.mockResolvedValue({ size: 0 } as any);

      const result = await mediaProcessor.validateMediaFile(filePath);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File is empty');
      expect(result.mediaType).toBe('unknown');
    });

    it('should reject video with excessive duration', async () => {
      const filePath = '/input/very-long-video.mp4';

      mockFs.stat.mockResolvedValue({ size: 1048576 } as any);

      const mockFfprobe = jest.fn((path, callback) => {
        callback(null, {
          format: { format_name: 'mp4', duration: 25 * 60 * 60 }, // 25 hours
          streams: [{ codec_type: 'video', width: 1920, height: 1080 }],
        });
      });
      mockFfmpeg.ffprobe = mockFfprobe;

      const result = await mediaProcessor.validateMediaFile(filePath);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Video duration exceeds maximum allowed (24 hours)');
      expect(result.mediaType).toBe('video');
    });

    it('should reject video with excessive resolution', async () => {
      const filePath = '/input/huge-resolution.mp4';

      mockFs.stat.mockResolvedValue({ size: 1048576 } as any);

      const mockFfprobe = jest.fn((path, callback) => {
        callback(null, {
          format: { format_name: 'mp4', duration: 60 },
          streams: [{ codec_type: 'video', width: 8192, height: 4608 }],
        });
      });
      mockFfmpeg.ffprobe = mockFfprobe;

      const result = await mediaProcessor.validateMediaFile(filePath);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Video resolution exceeds maximum allowed (4096x4096)');
      expect(result.mediaType).toBe('video');
    });

    it('should handle file that does not exist', async () => {
      const filePath = '/input/nonexistent.mp4';

      mockFs.access.mockRejectedValueOnce(new Error('File not found'));

      const result = await mediaProcessor.validateMediaFile(filePath);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Input file not found');
      expect(result.mediaType).toBe('unknown');
    });

    it('should handle corrupted media files', async () => {
      const filePath = '/input/corrupted.mp4';

      mockFs.stat.mockResolvedValue({ size: 1048576 } as any);

      const mockFfprobe = jest.fn((path, callback) => {
        callback(new Error('Invalid data found'), null);
      });
      mockFfmpeg.ffprobe = mockFfprobe;

      // For video extension, should fall back to extension-based detection
      const result = await mediaProcessor.validateMediaFile(filePath);

      expect(result.isValid).toBe(false);
      expect(result.mediaType).toBe('video');
    });

    it('should validate image files with Sharp when ffprobe fails', async () => {
      const filePath = '/input/image.jpg';

      mockFs.stat.mockResolvedValue({ size: 204800 } as any);

      // ffprobe fails
      const mockFfprobe = jest.fn((path, callback) => {
        callback(new Error('Not a video file'), null);
      });
      mockFfmpeg.ffprobe = mockFfprobe;

      // Sharp succeeds
      mockSharp.mockReturnValue({
        metadata: jest.fn().mockResolvedValue({
          width: 800,
          height: 600,
          format: 'jpeg',
        }),
      } as any);

      const result = await mediaProcessor.validateMediaFile(filePath);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.mediaType).toBe('image');
    });
  });

  describe('transcodeVideo()', () => {
    it('should transcode video successfully', async () => {
      const inputPath = '/input/video.mp4';
      const outputPath = '/output/transcoded.mp4';
      const options = {
        resolution: '1280x720',
        bitrate: '2000k',
        codec: 'libx264',
        format: 'mp4',
      };

      // Mock ffmpeg chain
      const mockFormat = jest.fn().mockReturnThis();
      const mockVideoCodec = jest.fn().mockReturnThis();
      const mockSize = jest.fn().mockReturnThis();
      const mockVideoBitrate = jest.fn().mockReturnThis();
      const mockAudioCodec = jest.fn().mockReturnThis();
      const mockAudioChannels = jest.fn().mockReturnThis();
      const mockAudioFrequency = jest.fn().mockReturnThis();
      const mockOutputOptions = jest.fn().mockReturnThis();
      const mockOutput = jest.fn().mockReturnThis();
      const mockRun = jest.fn();

      const mockOn: jest.MockedFunction<any> = jest.fn((event: string, callback: Function): any => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockOn;
      });

      mockFfmpeg.mockReturnValue({
        format: mockFormat,
        videoCodec: mockVideoCodec,
        size: mockSize,
        videoBitrate: mockVideoBitrate,
        audioCodec: mockAudioCodec,
        audioChannels: mockAudioChannels,
        audioFrequency: mockAudioFrequency,
        outputOptions: mockOutputOptions,
        output: mockOutput,
        on: mockOn,
        run: mockRun,
      } as any);

      const result = await mediaProcessor.transcodeVideo(inputPath, outputPath, options);

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe(outputPath);
      expect(result.duration).toBeGreaterThan(0);

      expect(mockFormat).toHaveBeenCalledWith('mp4');
      expect(mockVideoCodec).toHaveBeenCalledWith('libx264');
      expect(mockSize).toHaveBeenCalledWith('1280x720');
      expect(mockVideoBitrate).toHaveBeenCalledWith('2000k');
      expect(mockAudioCodec).toHaveBeenCalledWith('aac');
      expect(mockOutput).toHaveBeenCalledWith(outputPath);
    });

    it('should use default options when not specified', async () => {
      const inputPath = '/input/video.mp4';
      const outputPath = '/output/transcoded.mp4';
      const options = {};

      const mockFormat = jest.fn().mockReturnThis();
      const mockVideoCodec = jest.fn().mockReturnThis();
      const mockAudioCodec = jest.fn().mockReturnThis();
      const mockAudioChannels = jest.fn().mockReturnThis();
      const mockAudioFrequency = jest.fn().mockReturnThis();
      const mockOutputOptions = jest.fn().mockReturnThis();
      const mockOutput = jest.fn().mockReturnThis();
      const mockRun = jest.fn();

      const mockOn: jest.MockedFunction<any> = jest.fn((event: string, callback: Function): any => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockOn;
      });

      mockFfmpeg.mockReturnValue({
        format: mockFormat,
        videoCodec: mockVideoCodec,
        audioCodec: mockAudioCodec,
        audioChannels: mockAudioChannels,
        audioFrequency: mockAudioFrequency,
        outputOptions: mockOutputOptions,
        output: mockOutput,
        on: mockOn,
        run: mockRun,
      } as any);

      await mediaProcessor.transcodeVideo(inputPath, outputPath, options);

      expect(mockFormat).toHaveBeenCalledWith('mp4');
      expect(mockVideoCodec).toHaveBeenCalledWith('libx264');
    });

    it('should handle transcoding errors', async () => {
      const inputPath = '/input/video.mp4';
      const outputPath = '/output/transcoded.mp4';
      const options = {};

      const mockOn = jest.fn((event: string, callback: Function) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Transcoding failed')), 0);
        }
        return mockOn;
      });

      mockFfmpeg.mockReturnValue({
        format: jest.fn().mockReturnThis(),
        videoCodec: jest.fn().mockReturnThis(),
        audioCodec: jest.fn().mockReturnThis(),
        audioChannels: jest.fn().mockReturnThis(),
        audioFrequency: jest.fn().mockReturnThis(),
        outputOptions: jest.fn().mockReturnThis(),
        output: jest.fn().mockReturnThis(),
        on: mockOn,
        run: jest.fn(),
      } as any);

      const result = await mediaProcessor.transcodeVideo(inputPath, outputPath, options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Transcoding failed');
    });
  });

  describe('Constructor and configuration', () => {
    it('should set ffmpeg paths when provided', () => {
      const setFfmpegPathSpy = jest.spyOn(ffmpeg, 'setFfmpegPath');
      const setFfprobePathSpy = jest.spyOn(ffmpeg, 'setFfprobePath');

      new MediaProcessorService('/custom/ffmpeg', '/custom/ffprobe');

      expect(setFfmpegPathSpy).toHaveBeenCalledWith('/custom/ffmpeg');
      expect(setFfprobePathSpy).toHaveBeenCalledWith('/custom/ffprobe');
    });

    it('should use environment variables for paths', () => {
      process.env.FFMPEG_PATH = '/env/ffmpeg';
      process.env.FFPROBE_PATH = '/env/ffprobe';

      const setFfmpegPathSpy = jest.spyOn(ffmpeg, 'setFfmpegPath');
      const setFfprobePathSpy = jest.spyOn(ffmpeg, 'setFfprobePath');

      new MediaProcessorService();

      expect(setFfmpegPathSpy).toHaveBeenCalledWith('/env/ffmpeg');
      expect(setFfprobePathSpy).toHaveBeenCalledWith('/env/ffprobe');

      delete process.env.FFMPEG_PATH;
      delete process.env.FFPROBE_PATH;
    });
  });
});
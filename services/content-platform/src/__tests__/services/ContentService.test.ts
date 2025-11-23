import { ContentService } from '@/services/ContentService';
import { IContentRepository } from '@/interfaces/IContentRepository';
import { IStorageService } from '@/interfaces/IStorageService';
import { IMediaProcessor, MediaMetadata, ValidationResult } from '@/interfaces/IMediaProcessor';
import { Content, ContentType, ContentStatus, ContentCreateDto } from '@/models/Content';

// Mock implementations for testing
class MockContentRepository implements IContentRepository {
  private contents: Map<string, Content> = new Map();

  async create(contentData: any): Promise<Content> {
    const content = new Content(contentData);
    this.contents.set(content.id, content);
    return content;
  }

  async findById(id: string): Promise<Content | null> {
    return this.contents.get(id) || null;
  }

  async findAll(): Promise<Content[]> {
    return Array.from(this.contents.values());
  }

  async update(id: string, updateData: any): Promise<Content | null> {
    const content = this.contents.get(id);
    if (!content) return null;

    const updatedContent = new Content({
      ...content,
      ...updateData,
      updatedAt: new Date(),
    });
    this.contents.set(id, updatedContent);
    return updatedContent;
  }

  async delete(id: string): Promise<boolean> {
    const content = this.contents.get(id);
    if (!content) return false;

    const deletedContent = new Content({
      ...content,
      deletedAt: new Date(),
      status: ContentStatus.DELETED,
    });
    this.contents.set(id, deletedContent);
    return true;
  }

  async findByUserId(userId: string): Promise<Content[]> {
    return Array.from(this.contents.values()).filter(c => c.userId === userId && !c.isDeleted());
  }

  async exists(id: string): Promise<boolean> {
    return this.contents.has(id);
  }
}

class MockStorageService implements IStorageService {
  async uploadFile(file: Express.Multer.File, destination: string) {
    return {
      filePath: `/uploads/${file.originalname}`,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      url: `https://storage.example.com/uploads/${file.originalname}`,
    };
  }

  async deleteFile(filePath: string): Promise<boolean> {
    return true;
  }

  async getFileUrl(filePath: string): Promise<string> {
    return `https://storage.example.com${filePath}`;
  }

  async fileExists(filePath: string): Promise<boolean> {
    return true;
  }

  async getFileMetadata(filePath: string) {
    return {
      size: 1048576,
      mimeType: 'video/mp4',
      lastModified: new Date(),
    };
  }
}

class MockMediaProcessor implements IMediaProcessor {
  async generateVideoThumbnail(inputPath: string, outputPath: string) {
    return {
      success: true,
      outputPath,
      duration: 2,
    };
  }

  async generateImageThumbnail(inputPath: string, outputPath: string) {
    return {
      success: true,
      outputPath,
      duration: 1,
    };
  }

  async getMediaMetadata(filePath: string): Promise<MediaMetadata> {
    return {
      duration: 120,
      width: 1920,
      height: 1080,
      bitrate: 2000,
      codec: 'h264',
      format: 'mp4',
      size: 1048576,
    };
  }

  async validateMediaFile(filePath: string): Promise<ValidationResult> {
    return {
      isValid: true,
      errors: [],
      mediaType: 'video' as const,
    };
  }

  async transcodeVideo(inputPath: string, outputPath: string, options: any) {
    return {
      success: true,
      outputPath,
      duration: 10,
    };
  }
}

describe('ContentService', () => {
  let contentService: ContentService;
  let mockRepository: MockContentRepository;
  let mockStorage: MockStorageService;
  let mockProcessor: MockMediaProcessor;

  beforeEach(() => {
    mockRepository = new MockContentRepository();
    mockStorage = new MockStorageService();
    mockProcessor = new MockMediaProcessor();
    contentService = new ContentService(mockRepository, mockStorage, mockProcessor);
  });

  describe('uploadContent()', () => {
    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'test-video.mp4',
      encoding: '7bit',
      mimetype: 'video/mp4',
      size: 1048576,
      buffer: Buffer.from('fake video data'),
      destination: '/tmp',
      filename: 'test-video.mp4',
      path: '/tmp/test-video.mp4',
      stream: {} as any,
    };

    const contentMetadata: ContentCreateDto = {
      title: 'Test Video',
      description: 'A test video for testing',
      tags: ['test', 'video'],
      isPublic: false,
    };

    it('should upload video content successfully', async () => {
      const userId = 'user123';
      const result = await contentService.uploadContent(mockFile, contentMetadata, userId);

      expect(result).toBeInstanceOf(Content);
      expect(result.title).toBe(contentMetadata.title);
      expect(result.userId).toBe(userId);
      expect(result.contentType).toBe(ContentType.VIDEO);
      expect(result.originalFileName).toBe(mockFile.originalname);
      expect(result.fileSize).toBe(mockFile.size);
    });

    it('should generate thumbnail for video content', async () => {
      const generateThumbnailSpy = jest.spyOn(mockProcessor, 'generateVideoThumbnail');
      
      await contentService.uploadContent(mockFile, contentMetadata, 'user123');

      expect(generateThumbnailSpy).toHaveBeenCalled();
    });

    it('should validate media file during upload', async () => {
      const validateSpy = jest.spyOn(mockProcessor, 'validateMediaFile');
      
      await contentService.uploadContent(mockFile, contentMetadata, 'user123');

      expect(validateSpy).toHaveBeenCalled();
    });

    it('should throw error for invalid file', async () => {
      jest.spyOn(mockProcessor, 'validateMediaFile').mockResolvedValueOnce({
        isValid: false,
        errors: ['Invalid video format'],
        mediaType: 'video' as const,
      });

      await expect(
        contentService.uploadContent(mockFile, contentMetadata, 'user123')
      ).rejects.toThrow('Invalid media file: Invalid video format');
    });

    it('should handle image files correctly', async () => {
      const imageFile = {
        ...mockFile,
        originalname: 'test-image.jpg',
        mimetype: 'image/jpeg',
      };

      jest.spyOn(mockProcessor, 'validateMediaFile').mockResolvedValueOnce({
        isValid: true,
        errors: [],
        mediaType: 'image' as const,
      });

      jest.spyOn(mockProcessor, 'getMediaMetadata').mockResolvedValueOnce({
        width: 1920,
        height: 1080,
        format: 'jpeg',
        size: 1048576,
      });

      const result = await contentService.uploadContent(imageFile, contentMetadata, 'user123');

      expect(result.contentType).toBe(ContentType.IMAGE);
    });
  });

  describe('getContentById()', () => {
    it('should return content when found', async () => {
      const mockContent = new Content({
        id: '123',
        userId: 'user123',
        fileName: 'test.mp4',
        originalFileName: 'test.mp4',
        mimeType: 'video/mp4',
        fileSize: 1048576,
        filePath: '/uploads/test.mp4',
        title: 'Test Content',
        contentType: ContentType.VIDEO,
      });

      await mockRepository.create(mockContent);

      const result = await contentService.getContentById('123');

      expect(result).toBeInstanceOf(Content);
      expect(result.id).toBe('123');
    });

    it('should throw error when content not found', async () => {
      await expect(
        contentService.getContentById('nonexistent')
      ).rejects.toThrow('Content not found');
    });

    it('should throw error for deleted content', async () => {
      const mockContent = new Content({
        id: '123',
        userId: 'user123',
        fileName: 'test.mp4',
        originalFileName: 'test.mp4',
        mimeType: 'video/mp4',
        fileSize: 1048576,
        filePath: '/uploads/test.mp4',
        title: 'Test Content',
        contentType: ContentType.VIDEO,
        deletedAt: new Date(),
      });

      await mockRepository.create(mockContent);

      await expect(
        contentService.getContentById('123')
      ).rejects.toThrow('Content not found');
    });
  });

  describe('validateContentOwnership()', () => {
    it('should return true for content owner', async () => {
      const mockContent = new Content({
        id: '123',
        userId: 'user123',
        fileName: 'test.mp4',
        originalFileName: 'test.mp4',
        mimeType: 'video/mp4',
        fileSize: 1048576,
        filePath: '/uploads/test.mp4',
        title: 'Test Content',
        contentType: ContentType.VIDEO,
      });

      await mockRepository.create(mockContent);

      const result = await contentService.validateContentOwnership('123', 'user123');

      expect(result).toBe(true);
    });

    it('should return false for non-owner', async () => {
      const mockContent = new Content({
        id: '123',
        userId: 'user123',
        fileName: 'test.mp4',
        originalFileName: 'test.mp4',
        mimeType: 'video/mp4',
        fileSize: 1048576,
        filePath: '/uploads/test.mp4',
        title: 'Test Content',
        contentType: ContentType.VIDEO,
      });

      await mockRepository.create(mockContent);

      const result = await contentService.validateContentOwnership('123', 'different-user');

      expect(result).toBe(false);
    });

    it('should return false for nonexistent content', async () => {
      const result = await contentService.validateContentOwnership('nonexistent', 'user123');

      expect(result).toBe(false);
    });
  });

  describe('deleteContent()', () => {
    it('should delete content successfully for owner', async () => {
      const mockContent = new Content({
        id: '123',
        userId: 'user123',
        fileName: 'test.mp4',
        originalFileName: 'test.mp4',
        mimeType: 'video/mp4',
        fileSize: 1048576,
        filePath: '/uploads/test.mp4',
        title: 'Test Content',
        contentType: ContentType.VIDEO,
      });

      await mockRepository.create(mockContent);

      const result = await contentService.deleteContent('123', 'user123');

      expect(result).toBe(true);

      // Verify content is marked as deleted
      const deletedContent = await mockRepository.findById('123');
      expect(deletedContent?.isDeleted()).toBe(true);
    });

    it('should throw error for non-owner deletion attempt', async () => {
      const mockContent = new Content({
        id: '123',
        userId: 'user123',
        fileName: 'test.mp4',
        originalFileName: 'test.mp4',
        mimeType: 'video/mp4',
        fileSize: 1048576,
        filePath: '/uploads/test.mp4',
        title: 'Test Content',
        contentType: ContentType.VIDEO,
      });

      await mockRepository.create(mockContent);

      await expect(
        contentService.deleteContent('123', 'different-user')
      ).rejects.toThrow('Content not found or access denied');
    });
  });
});
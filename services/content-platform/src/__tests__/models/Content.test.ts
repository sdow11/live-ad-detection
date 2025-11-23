import { Content, ContentType, ContentStatus, ContentData } from '@/models/Content';

describe('Content Domain Model', () => {
  const validContentData: ContentData = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    userId: 'user123',
    fileName: 'video.mp4',
    originalFileName: 'my-video.mp4',
    mimeType: 'video/mp4',
    fileSize: 1048576, // 1MB
    filePath: '/uploads/video.mp4',
    thumbnailPath: '/uploads/video-thumb.jpg',
    title: 'My Test Video',
    description: 'A test video',
    tags: ['test', 'video'],
    contentType: ContentType.VIDEO,
    duration: 120, // 2 minutes
    width: 1920,
    height: 1080,
    metadata: {
      bitrate: 2000,
      codec: 'h264',
      fps: 30,
    },
    status: ContentStatus.READY,
    isPublic: false,
  };

  describe('Constructor', () => {
    it('should create a Content instance with valid data', () => {
      const content = new Content(validContentData);

      expect(content.id).toBe(validContentData.id);
      expect(content.userId).toBe(validContentData.userId);
      expect(content.title).toBe(validContentData.title);
      expect(content.contentType).toBe(ContentType.VIDEO);
      expect(content.status).toBe(ContentStatus.READY);
    });

    it('should set default values for optional fields', () => {
      const minimalData = {
        ...validContentData,
        tags: undefined,
        status: undefined,
        isPublic: undefined,
        createdAt: undefined,
        updatedAt: undefined,
      };

      const content = new Content(minimalData);

      expect(content.tags).toEqual([]);
      expect(content.status).toBe(ContentStatus.PROCESSING);
      expect(content.isPublic).toBe(false);
      expect(content.createdAt).toBeDefined();
      expect(content.updatedAt).toBeDefined();
    });

    it('should throw error if required fields are missing', () => {
      expect(() => new Content({ ...validContentData, id: '' }))
        .toThrow('Content ID is required');

      expect(() => new Content({ ...validContentData, userId: '' }))
        .toThrow('User ID is required');

      expect(() => new Content({ ...validContentData, fileName: '' }))
        .toThrow('File name is required');

      expect(() => new Content({ ...validContentData, title: '' }))
        .toThrow('Title is required');

      expect(() => new Content({ ...validContentData, title: '   ' }))
        .toThrow('Title is required');
    });

    it('should throw error for invalid file size', () => {
      expect(() => new Content({ ...validContentData, fileSize: 0 }))
        .toThrow('Valid file size is required');

      expect(() => new Content({ ...validContentData, fileSize: -1 }))
        .toThrow('Valid file size is required');
    });

    it('should throw error for invalid content type', () => {
      expect(() => new Content({ ...validContentData, contentType: 'invalid' as ContentType }))
        .toThrow('Valid content type is required');
    });
  });

  describe('Business Logic Methods', () => {
    let content: Content;

    beforeEach(() => {
      content = new Content(validContentData);
    });

    describe('isDeleted()', () => {
      it('should return false when deletedAt is undefined', () => {
        expect(content.isDeleted()).toBe(false);
      });

      it('should return true when deletedAt is set', () => {
        const deletedContent = new Content({
          ...validContentData,
          deletedAt: new Date(),
        });

        expect(deletedContent.isDeleted()).toBe(true);
      });
    });

    describe('isReady()', () => {
      it('should return true when status is READY', () => {
        expect(content.isReady()).toBe(true);
      });

      it('should return false when status is not READY', () => {
        const processingContent = new Content({
          ...validContentData,
          status: ContentStatus.PROCESSING,
        });

        expect(processingContent.isReady()).toBe(false);
      });
    });

    describe('isProcessing()', () => {
      it('should return false when status is READY', () => {
        expect(content.isProcessing()).toBe(false);
      });

      it('should return true when status is PROCESSING', () => {
        const processingContent = new Content({
          ...validContentData,
          status: ContentStatus.PROCESSING,
        });

        expect(processingContent.isProcessing()).toBe(true);
      });
    });

    describe('getFormattedFileSize()', () => {
      it('should format bytes correctly', () => {
        const content1MB = new Content({ ...validContentData, fileSize: 1048576 });
        expect(content1MB.getFormattedFileSize()).toBe('1.0 MB');

        const content1KB = new Content({ ...validContentData, fileSize: 1024 });
        expect(content1KB.getFormattedFileSize()).toBe('1.0 KB');

        const content1GB = new Content({ ...validContentData, fileSize: 1073741824 });
        expect(content1GB.getFormattedFileSize()).toBe('1.0 GB');

        const content500B = new Content({ ...validContentData, fileSize: 500 });
        expect(content500B.getFormattedFileSize()).toBe('500.0 B');
      });
    });

    describe('getFormattedDuration()', () => {
      it('should format duration correctly', () => {
        expect(content.getFormattedDuration()).toBe('00:02:00');

        const content1Hour = new Content({ ...validContentData, duration: 3661 }); // 1h 1m 1s
        expect(content1Hour.getFormattedDuration()).toBe('01:01:01');

        const content30Sec = new Content({ ...validContentData, duration: 30 });
        expect(content30Sec.getFormattedDuration()).toBe('00:00:30');
      });

      it('should return null for non-video content', () => {
        const imageContent = new Content({
          ...validContentData,
          contentType: ContentType.IMAGE,
          duration: undefined,
        });

        expect(imageContent.getFormattedDuration()).toBeNull();
      });
    });
  });

  describe('Data Integrity', () => {
    it('should have readonly properties enforced by TypeScript', () => {
      const content = new Content(validContentData);

      // Properties are readonly at compile time
      // Runtime checks would require property descriptors or proxies
      expect(content.title).toBe('My Test Video');
      expect(content.userId).toBe('user123');
      expect(content.contentType).toBe(ContentType.VIDEO);
    });

    it('should handle metadata correctly', () => {
      const content = new Content(validContentData);

      expect(content.metadata.bitrate).toBe(2000);
      expect(content.metadata.codec).toBe('h264');
      expect(content.metadata.fps).toBe(30);
    });
  });
});
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ContentRepository } from '@/database/repositories/ContentRepository';
import { ContentEntity } from '@/database/entities/ContentEntity';
import { Content, ContentType, ContentStatus, ContentData } from '@/models/Content';

/**
 * Content Repository Integration Tests
 * 
 * Tests the database layer with an in-memory SQLite database
 * Follows TDD approach with comprehensive test coverage
 */

// Test database setup
const testDataSource = new DataSource({
  type: 'sqlite',
  database: ':memory:',
  dropSchema: true,
  synchronize: true,
  logging: false,
  entities: [ContentEntity],
});

describe('ContentRepository Integration Tests', () => {
  let repository: ContentRepository;
  let testContent: ContentData;

  beforeAll(async () => {
    await testDataSource.initialize();
    
    // Mock the AppDataSource for testing
    jest.doMock('@/database/config/database.config', () => ({
      AppDataSource: testDataSource,
    }));

    // Import ContentRepository after mocking
    const { ContentRepository: TestContentRepository } = await import('@/database/repositories/ContentRepository');
    repository = new TestContentRepository();
  });

  afterAll(async () => {
    await testDataSource.destroy();
  });

  beforeEach(async () => {
    // Clean up database before each test
    await testDataSource.getRepository(ContentEntity).clear();

    // Create test content data
    testContent = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      userId: 'user-123',
      fileName: 'test-video.mp4',
      originalFileName: 'my-test-video.mp4',
      mimeType: 'video/mp4',
      fileSize: 1048576, // 1MB
      filePath: '/uploads/test-video.mp4',
      thumbnailPath: '/uploads/test-video-thumb.jpg',
      title: 'Test Video Content',
      description: 'A test video for testing purposes',
      tags: ['test', 'video', 'demo'],
      contentType: ContentType.VIDEO,
      duration: 120, // 2 minutes
      width: 1920,
      height: 1080,
      metadata: {
        bitrate: 2000,
        codec: 'h264',
        fps: 30,
        uploadedFrom: 'test',
      },
      status: ContentStatus.READY,
      isPublic: false,
    };
  });

  describe('create()', () => {
    it('should create content successfully', async () => {
      const result = await repository.create(testContent);

      expect(result).toBeInstanceOf(Content);
      expect(result.id).toBe(testContent.id);
      expect(result.title).toBe(testContent.title);
      expect(result.userId).toBe(testContent.userId);
      expect(result.contentType).toBe(ContentType.VIDEO);
      expect(result.status).toBe(ContentStatus.READY);
      expect(result.tags).toEqual(['test', 'video', 'demo']);
      expect(result.metadata.bitrate).toBe(2000);
    });

    it('should set default values for optional fields', async () => {
      const minimalContent = {
        ...testContent,
        description: undefined,
        tags: undefined,
        thumbnailPath: undefined,
        duration: undefined,
        width: undefined,
        height: undefined,
        metadata: undefined,
        status: undefined,
        isPublic: undefined,
      };

      const result = await repository.create(minimalContent);

      expect(result.description).toBeNull();
      expect(result.tags).toEqual([]);
      expect(result.thumbnailPath).toBeNull();
      expect(result.duration).toBeNull();
      expect(result.width).toBeNull();
      expect(result.height).toBeNull();
      expect(result.metadata).toEqual({});
      expect(result.status).toBe(ContentStatus.PROCESSING);
      expect(result.isPublic).toBe(false);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('should throw error for invalid data', async () => {
      const invalidContent = { ...testContent, fileSize: -1 };

      await expect(repository.create(invalidContent)).rejects.toThrow();
    });
  });

  describe('findById()', () => {
    it('should find content by ID when exists', async () => {
      await repository.create(testContent);

      const result = await repository.findById(testContent.id);

      expect(result).toBeInstanceOf(Content);
      expect(result?.id).toBe(testContent.id);
      expect(result?.title).toBe(testContent.title);
    });

    it('should return null when content does not exist', async () => {
      const result = await repository.findById('nonexistent-id');

      expect(result).toBeNull();
    });

    it('should return null for soft-deleted content', async () => {
      await repository.create(testContent);
      await repository.delete(testContent.id);

      const result = await repository.findById(testContent.id);

      // Note: This test depends on how we handle soft-deleted content
      // in findById. We may want to return soft-deleted content for some operations
      expect(result).toBeNull();
    });
  });

  describe('findAll()', () => {
    beforeEach(async () => {
      // Create multiple test content items
      const contents = [
        { ...testContent, id: 'content-1', title: 'Video 1', contentType: ContentType.VIDEO },
        { ...testContent, id: 'content-2', title: 'Image 1', contentType: ContentType.IMAGE, duration: undefined },
        { ...testContent, id: 'content-3', title: 'Video 2', contentType: ContentType.VIDEO, isPublic: true },
        { ...testContent, id: 'content-4', title: 'Image 2', contentType: ContentType.IMAGE, duration: undefined, status: ContentStatus.PROCESSING },
      ];

      for (const content of contents) {
        await repository.create(content);
      }
    });

    it('should return all content without filter', async () => {
      const results = await repository.findAll();

      expect(results).toHaveLength(4);
      expect(results.every(r => r instanceof Content)).toBe(true);
    });

    it('should filter by content type', async () => {
      const results = await repository.findAll({ contentType: ContentType.VIDEO });

      expect(results).toHaveLength(2);
      expect(results.every(r => r.contentType === ContentType.VIDEO)).toBe(true);
    });

    it('should filter by status', async () => {
      const results = await repository.findAll({ status: ContentStatus.PROCESSING });

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe(ContentStatus.PROCESSING);
    });

    it('should filter by isPublic', async () => {
      const results = await repository.findAll({ isPublic: true });

      expect(results).toHaveLength(1);
      expect(results[0].isPublic).toBe(true);
    });

    it('should handle pagination', async () => {
      const page1 = await repository.findAll({ limit: 2, offset: 0 });
      const page2 = await repository.findAll({ limit: 2, offset: 2 });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page1[0].id).not.toBe(page2[0].id);
    });

    it('should handle sorting', async () => {
      const resultsByTitle = await repository.findAll({ 
        sortBy: 'title', 
        sortOrder: 'asc' 
      });

      expect(resultsByTitle[0].title).toBe('Image 1');
      expect(resultsByTitle[1].title).toBe('Image 2');
    });

    it('should search in title and description', async () => {
      // This test may need adjustment based on the actual search implementation
      const results = await repository.findAll({ search: 'Video' });

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.title.includes('Video'))).toBe(true);
    });
  });

  describe('update()', () => {
    beforeEach(async () => {
      await repository.create(testContent);
    });

    it('should update content successfully', async () => {
      const updateData = {
        title: 'Updated Title',
        description: 'Updated description',
        tags: ['updated', 'tags'],
        isPublic: true,
      };

      const result = await repository.update(testContent.id, updateData);

      expect(result).toBeInstanceOf(Content);
      expect(result?.title).toBe('Updated Title');
      expect(result?.description).toBe('Updated description');
      expect(result?.tags).toEqual(['updated', 'tags']);
      expect(result?.isPublic).toBe(true);
    });

    it('should update only provided fields', async () => {
      const originalContent = await repository.findById(testContent.id);
      const updateData = { title: 'New Title Only' };

      const result = await repository.update(testContent.id, updateData);

      expect(result?.title).toBe('New Title Only');
      expect(result?.description).toBe(originalContent?.description);
      expect(result?.tags).toEqual(originalContent?.tags);
    });

    it('should return null for nonexistent content', async () => {
      const result = await repository.update('nonexistent-id', { title: 'New Title' });

      expect(result).toBeNull();
    });
  });

  describe('delete()', () => {
    beforeEach(async () => {
      await repository.create(testContent);
    });

    it('should soft delete content', async () => {
      const result = await repository.delete(testContent.id);

      expect(result).toBe(true);

      // Verify soft delete - content should still exist in DB but with deletedAt set
      const entity = await testDataSource
        .getRepository(ContentEntity)
        .findOne({ where: { id: testContent.id }, withDeleted: true });

      expect(entity).toBeDefined();
      expect(entity?.deletedAt).toBeDefined();
    });

    it('should return false for nonexistent content', async () => {
      const result = await repository.delete('nonexistent-id');

      expect(result).toBe(false);
    });
  });

  describe('findByUserId()', () => {
    beforeEach(async () => {
      const user1Contents = [
        { ...testContent, id: 'user1-content1', userId: 'user-1', title: 'User 1 Content 1' },
        { ...testContent, id: 'user1-content2', userId: 'user-1', title: 'User 1 Content 2' },
      ];

      const user2Contents = [
        { ...testContent, id: 'user2-content1', userId: 'user-2', title: 'User 2 Content 1' },
      ];

      for (const content of [...user1Contents, ...user2Contents]) {
        await repository.create(content);
      }
    });

    it('should return content for specific user', async () => {
      const results = await repository.findByUserId('user-1');

      expect(results).toHaveLength(2);
      expect(results.every(r => r.userId === 'user-1')).toBe(true);
    });

    it('should return empty array for user with no content', async () => {
      const results = await repository.findByUserId('user-with-no-content');

      expect(results).toEqual([]);
    });

    it('should exclude soft-deleted content', async () => {
      await repository.delete('user1-content1');

      const results = await repository.findByUserId('user-1');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('user1-content2');
    });

    it('should sort by creation date descending', async () => {
      const results = await repository.findByUserId('user-1');

      // Assuming consistent creation order, newest should be first
      expect(results[0].title).toBe('User 1 Content 2');
      expect(results[1].title).toBe('User 1 Content 1');
    });
  });

  describe('exists()', () => {
    beforeEach(async () => {
      await repository.create(testContent);
    });

    it('should return true for existing content', async () => {
      const result = await repository.exists(testContent.id);

      expect(result).toBe(true);
    });

    it('should return false for nonexistent content', async () => {
      const result = await repository.exists('nonexistent-id');

      expect(result).toBe(false);
    });

    it('should return true for soft-deleted content', async () => {
      await repository.delete(testContent.id);

      const result = await repository.exists(testContent.id);

      // exists() checks for record existence regardless of deletion status
      expect(result).toBe(true);
    });
  });

  describe('Database Constraints', () => {
    it('should enforce positive file size constraint', async () => {
      const invalidContent = { ...testContent, fileSize: -100 };

      await expect(repository.create(invalidContent)).rejects.toThrow();
    });

    it('should enforce non-empty title constraint', async () => {
      const invalidContent = { ...testContent, title: '   ' };

      await expect(repository.create(invalidContent)).rejects.toThrow();
    });
  });
});
import fs from 'fs/promises';
import path from 'path';
import { LocalStorageService } from '@/services/LocalStorageService';
import { NotFoundError, InternalServerError } from '@/utils/errors';

// Mock fs module
jest.mock('fs/promises');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('LocalStorageService', () => {
  let storageService: LocalStorageService;
  const testBasePath = '/tmp/test-uploads';
  const testBaseUrl = 'http://localhost:3000/files';

  beforeEach(() => {
    storageService = new LocalStorageService(testBasePath, testBaseUrl);
    jest.clearAllMocks();
  });

  describe('uploadFile()', () => {
    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'test.mp4',
      encoding: '7bit',
      mimetype: 'video/mp4',
      size: 1024,
      buffer: Buffer.from('test file content'),
      destination: '',
      filename: '',
      path: '',
      stream: {} as any,
    };

    it('should upload file successfully', async () => {
      const destination = 'content/user123/test.mp4';
      const expectedFullPath = path.join(testBasePath, destination);

      mockFs.writeFile.mockResolvedValueOnce(undefined);
      mockFs.stat.mockResolvedValueOnce({
        size: mockFile.size,
        mtime: new Date(),
        isDirectory: () => false,
      } as any);

      // Mock directory creation
      mockFs.access.mockRejectedValueOnce(new Error('Directory not exists'));
      mockFs.mkdir.mockResolvedValueOnce(undefined);

      const result = await storageService.uploadFile(mockFile, destination);

      expect(result).toEqual({
        filePath: destination,
        fileName: 'test.mp4',
        fileSize: mockFile.size,
        mimeType: mockFile.mimetype,
        url: `${testBaseUrl}/${destination}`,
      });

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.dirname(expectedFullPath),
        { recursive: true }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(expectedFullPath, mockFile.buffer);
    });

    it('should create directory if it does not exist', async () => {
      const destination = 'content/new-user/test.mp4';
      
      mockFs.access.mockRejectedValueOnce(new Error('Directory not exists'));
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValueOnce(undefined);
      mockFs.stat.mockResolvedValueOnce({
        size: mockFile.size,
      } as any);

      await storageService.uploadFile(mockFile, destination);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.dirname(path.join(testBasePath, destination)),
        { recursive: true }
      );
    });

    it('should throw error if file size mismatch after upload', async () => {
      const destination = 'content/user123/test.mp4';

      mockFs.access.mockResolvedValueOnce(undefined); // Directory exists
      mockFs.writeFile.mockResolvedValueOnce(undefined);
      mockFs.stat.mockResolvedValueOnce({
        size: 2048, // Different size
      } as any);

      await expect(
        storageService.uploadFile(mockFile, destination)
      ).rejects.toThrow('File size mismatch after upload');
    });

    it('should throw InternalServerError on write failure', async () => {
      const destination = 'content/user123/test.mp4';
      
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockRejectedValueOnce(new Error('Disk full'));

      await expect(
        storageService.uploadFile(mockFile, destination)
      ).rejects.toThrow(InternalServerError);
    });
  });

  describe('deleteFile()', () => {
    it('should delete file successfully', async () => {
      const filePath = 'content/user123/test.mp4';

      mockFs.access.mockResolvedValueOnce(undefined); // File exists
      mockFs.unlink.mockResolvedValueOnce(undefined);

      const result = await storageService.deleteFile(filePath);

      expect(result).toBe(true);
      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join(testBasePath, filePath)
      );
    });

    it('should return false if file does not exist', async () => {
      const filePath = 'content/user123/nonexistent.mp4';

      mockFs.access.mockRejectedValueOnce(new Error('File not found'));

      const result = await storageService.deleteFile(filePath);

      expect(result).toBe(false);
      expect(mockFs.unlink).not.toHaveBeenCalled();
    });

    it('should return false on ENOENT error', async () => {
      const filePath = 'content/user123/test.mp4';

      mockFs.access.mockResolvedValueOnce(undefined);
      const error = new Error('File not found') as any;
      error.code = 'ENOENT';
      mockFs.unlink.mockRejectedValueOnce(error);

      const result = await storageService.deleteFile(filePath);

      expect(result).toBe(false);
    });

    it('should throw InternalServerError on other errors', async () => {
      const filePath = 'content/user123/test.mp4';

      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.unlink.mockRejectedValueOnce(new Error('Permission denied'));

      await expect(
        storageService.deleteFile(filePath)
      ).rejects.toThrow(InternalServerError);
    });
  });

  describe('getFileUrl()', () => {
    it('should return file URL when file exists', async () => {
      const filePath = 'content/user123/test.mp4';

      mockFs.access.mockResolvedValueOnce(undefined);

      const result = await storageService.getFileUrl(filePath);

      expect(result).toBe(`${testBaseUrl}/${filePath}`);
    });

    it('should throw NotFoundError when file does not exist', async () => {
      const filePath = 'content/user123/nonexistent.mp4';

      mockFs.access.mockRejectedValueOnce(new Error('File not found'));

      await expect(
        storageService.getFileUrl(filePath)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('fileExists()', () => {
    it('should return true when file exists', async () => {
      const filePath = 'content/user123/test.mp4';

      mockFs.access.mockResolvedValueOnce(undefined);

      const result = await storageService.fileExists(filePath);

      expect(result).toBe(true);
    });

    it('should return false when file does not exist', async () => {
      const filePath = 'content/user123/nonexistent.mp4';

      mockFs.access.mockRejectedValueOnce(new Error('File not found'));

      const result = await storageService.fileExists(filePath);

      expect(result).toBe(false);
    });
  });

  describe('getFileMetadata()', () => {
    it('should return file metadata', async () => {
      const filePath = 'content/user123/test.mp4';
      const mockStat = {
        size: 1024,
        mtime: new Date('2023-01-01T10:00:00Z'),
      };

      mockFs.stat.mockResolvedValueOnce(mockStat as any);

      const result = await storageService.getFileMetadata(filePath);

      expect(result).toEqual({
        size: 1024,
        mimeType: 'video/mp4',
        lastModified: mockStat.mtime,
        etag: `${mockStat.mtime.getTime()}-${mockStat.size}`,
      });
    });

    it('should throw NotFoundError when file does not exist', async () => {
      const filePath = 'content/user123/nonexistent.mp4';
      const error = new Error('File not found') as any;
      error.code = 'ENOENT';

      mockFs.stat.mockRejectedValueOnce(error);

      await expect(
        storageService.getFileMetadata(filePath)
      ).rejects.toThrow(NotFoundError);
    });

    it('should determine MIME type from file extension', async () => {
      const testCases = [
        { filePath: 'test.jpg', expectedMimeType: 'image/jpeg' },
        { filePath: 'test.png', expectedMimeType: 'image/png' },
        { filePath: 'test.webm', expectedMimeType: 'video/webm' },
        { filePath: 'test.unknown', expectedMimeType: 'application/octet-stream' },
      ];

      for (const testCase of testCases) {
        mockFs.stat.mockResolvedValueOnce({
          size: 1024,
          mtime: new Date(),
        } as any);

        const result = await storageService.getFileMetadata(testCase.filePath);

        expect(result.mimeType).toBe(testCase.expectedMimeType);
      }
    });
  });

  describe('getDiskSpace()', () => {
    it('should return disk space information', async () => {
      const mockStatfs = {
        bavail: 1000, // Available blocks
        bsize: 4096,  // Block size
        blocks: 2000, // Total blocks
      };

      mockFs.statfs.mockResolvedValueOnce(mockStatfs as any);

      const result = await storageService.getDiskSpace();

      expect(result).toEqual({
        free: 1000 * 4096,
        total: 2000 * 4096,
        used: 1000 * 4096, // total - free
      });
    });

    it('should throw InternalServerError on statfs failure', async () => {
      mockFs.statfs.mockRejectedValueOnce(new Error('statfs failed'));

      await expect(
        storageService.getDiskSpace()
      ).rejects.toThrow(InternalServerError);
    });
  });

  describe('URL generation', () => {
    it('should handle Windows-style paths in URLs', async () => {
      const filePath = 'content\\\\user123\\\\test.mp4';

      mockFs.access.mockResolvedValueOnce(undefined);

      const result = await storageService.getFileUrl(filePath);

      expect(result).toBe(`${testBaseUrl}/content/user123/test.mp4`);
    });

    it('should handle nested directory paths', async () => {
      const filePath = 'content/users/123/videos/test.mp4';

      mockFs.access.mockResolvedValueOnce(undefined);

      const result = await storageService.getFileUrl(filePath);

      expect(result).toBe(`${testBaseUrl}/${filePath}`);
    });
  });

  describe('Error handling', () => {
    it('should provide meaningful error messages', async () => {
      const destination = 'content/user123/test.mp4';
      
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockRejectedValueOnce(new Error('Custom error message'));

      await expect(
        storageService.uploadFile({} as any, destination)
      ).rejects.toThrow('Failed to upload file: Custom error message');
    });

    it('should handle non-Error objects in catch blocks', async () => {
      const destination = 'content/user123/test.mp4';
      
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockRejectedValueOnce('String error');

      await expect(
        storageService.uploadFile({} as any, destination)
      ).rejects.toThrow('Failed to upload file: String error');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete upload-to-delete lifecycle', async () => {
      const mockFile: Express.Multer.File = {
        buffer: Buffer.from('test'),
        mimetype: 'video/mp4',
        size: 4,
      } as any;
      const destination = 'content/user123/test.mp4';

      // Upload
      mockFs.access.mockRejectedValueOnce(new Error('Dir not exists'));
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValueOnce(undefined);
      mockFs.stat.mockResolvedValueOnce({ size: 4 } as any);

      const uploadResult = await storageService.uploadFile(mockFile, destination);
      expect(uploadResult.filePath).toBe(destination);

      // File exists check
      mockFs.access.mockResolvedValueOnce(undefined);
      const exists = await storageService.fileExists(destination);
      expect(exists).toBe(true);

      // Get metadata
      mockFs.stat.mockResolvedValueOnce({
        size: 4,
        mtime: new Date(),
      } as any);
      const metadata = await storageService.getFileMetadata(destination);
      expect(metadata.size).toBe(4);

      // Delete
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.unlink.mockResolvedValueOnce(undefined);
      const deleted = await storageService.deleteFile(destination);
      expect(deleted).toBe(true);
    });
  });
});
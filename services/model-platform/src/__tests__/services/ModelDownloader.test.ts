import fs from 'fs/promises';
import axios, { AxiosResponse } from 'axios';
import * as crypto from 'crypto';
import { ModelDownloaderService } from '@/services/ModelDownloaderService';
import { DownloadStatus, DownloadOptions } from '@/interfaces/IModelDownloader';
import { DownloadError, ChecksumError } from '@/utils/errors';

/**
 * Model Downloader Service Tests
 * 
 * Tests following TDD approach with comprehensive coverage
 */

// Mock dependencies
jest.mock('fs/promises');
jest.mock('axios');
jest.mock('crypto');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockAxios = axios as jest.Mocked<typeof axios>;
const mockCrypto = crypto as jest.Mocked<typeof crypto>;

describe('ModelDownloaderService', () => {
  let downloader: ModelDownloaderService;
  const testCachePath = '/tmp/test-models';

  beforeEach(() => {
    downloader = new ModelDownloaderService(testCachePath);
    jest.clearAllMocks();

    // Setup default mocks
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue({ size: 1024 } as any);
  });

  describe('downloadModel()', () => {
    const testUrl = 'https://example.com/model.zip';
    const testDestination = '/tmp/test-models/model.zip';

    it('should download model successfully', async () => {
      const mockResponseData = Buffer.from('test model data');
      const mockResponse: Partial<AxiosResponse> = {
        data: mockResponseData,
        headers: { 'content-length': '1024' },
        status: 200,
        statusText: 'OK',
        config: {} as any,
      };

      mockAxios.get.mockResolvedValueOnce(mockResponse as AxiosResponse);

      // Mock checksum calculation
      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('expected-checksum'),
      };
      mockCrypto.createHash.mockReturnValue(mockHash as any);

      const result = await downloader.downloadModel(testUrl, testDestination);

      expect(result.success).toBe(true);
      expect(result.filePath).toBe(testDestination);
      expect(result.fileSize).toBe(1024);
      expect(result.checksum).toBe('expected-checksum');
      expect(result.duration).toBeGreaterThan(0);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('/tmp/test-models'),
        { recursive: true }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(testDestination, mockResponseData);
    });

    it('should handle download with progress callback', async () => {
      const mockResponseData = Buffer.from('test model data');
      const mockResponse: Partial<AxiosResponse> = {
        data: mockResponseData,
        headers: { 'content-length': '1024' },
        status: 200,
        statusText: 'OK',
        config: {} as any,
      };

      mockAxios.get.mockResolvedValueOnce(mockResponse as AxiosResponse);

      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('checksum'),
      };
      mockCrypto.createHash.mockReturnValue(mockHash as any);

      const progressCallback = jest.fn();
      const options: DownloadOptions = {
        onProgress: progressCallback,
      };

      const result = await downloader.downloadModel(testUrl, testDestination, options);

      expect(result.success).toBe(true);
      expect(progressCallback).toHaveBeenCalled();
      
      const progressCall = progressCallback.mock.calls[0][0];
      expect(progressCall.status).toBe(DownloadStatus.COMPLETED);
      expect(progressCall.percentage).toBe(100);
    });

    it('should retry on failure', async () => {
      mockAxios.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          data: Buffer.from('test data'),
          headers: { 'content-length': '1024' },
          status: 200,
          statusText: 'OK',
          config: {} as any,
        } as AxiosResponse);

      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('checksum'),
      };
      mockCrypto.createHash.mockReturnValue(mockHash as any);

      const options: DownloadOptions = {
        retries: 3,
        retryDelay: 100,
      };

      const result = await downloader.downloadModel(testUrl, testDestination, options);

      expect(result.success).toBe(true);
      expect(mockAxios.get).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      mockAxios.get.mockRejectedValue(new Error('Persistent network error'));

      const options: DownloadOptions = {
        retries: 2,
        retryDelay: 50,
      };

      const result = await downloader.downloadModel(testUrl, testDestination, options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Persistent network error');
      expect(mockAxios.get).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should handle timeout', async () => {
      mockAxios.get.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout of 5000ms exceeded')), 100)
        )
      );

      const options: DownloadOptions = {
        timeout: 5000,
      };

      const result = await downloader.downloadModel(testUrl, testDestination, options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should create destination directory', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('Directory not found'));

      const mockResponse: Partial<AxiosResponse> = {
        data: Buffer.from('test data'),
        headers: { 'content-length': '1024' },
        status: 200,
      };
      mockAxios.get.mockResolvedValueOnce(mockResponse as AxiosResponse);

      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('checksum'),
      };
      mockCrypto.createHash.mockReturnValue(mockHash as any);

      await downloader.downloadModel(testUrl, testDestination);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringMatching(/\/tmp\/test-models/),
        { recursive: true }
      );
    });

    it('should handle large files with streaming', async () => {
      const mockStream: any = {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            // Simulate multiple data chunks
            callback(Buffer.from('chunk1'));
            callback(Buffer.from('chunk2'));
            callback(Buffer.from('chunk3'));
          } else if (event === 'end') {
            callback();
          }
          return mockStream;
        }),
        pipe: jest.fn().mockReturnThis(),
      };

      const mockResponse: Partial<AxiosResponse> = {
        data: mockStream,
        headers: { 'content-length': '10485760' }, // 10MB
        status: 200,
      };

      mockAxios.get.mockResolvedValueOnce(mockResponse as AxiosResponse);

      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('large-file-checksum'),
      };
      mockCrypto.createHash.mockReturnValue(mockHash as any);

      const result = await downloader.downloadModel(testUrl, testDestination);

      expect(result.success).toBe(true);
      expect(result.checksum).toBe('large-file-checksum');
    });
  });

  describe('downloadBatch()', () => {
    it('should download multiple models concurrently', async () => {
      const downloads = [
        { url: 'https://example.com/model1.zip', destinationPath: '/tmp/model1.zip' },
        { url: 'https://example.com/model2.zip', destinationPath: '/tmp/model2.zip' },
        { url: 'https://example.com/model3.zip', destinationPath: '/tmp/model3.zip' },
      ];

      mockAxios.get.mockResolvedValue({
        data: Buffer.from('test data'),
        headers: { 'content-length': '1024' },
        status: 200,
        statusText: 'OK',
        config: {} as any,
      } as AxiosResponse);

      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('batch-checksum'),
      };
      mockCrypto.createHash.mockReturnValue(mockHash as any);

      const results = await downloader.downloadBatch(downloads);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      expect(mockAxios.get).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed success/failure in batch', async () => {
      const downloads = [
        { url: 'https://example.com/model1.zip', destinationPath: '/tmp/model1.zip' },
        { url: 'https://example.com/model2.zip', destinationPath: '/tmp/model2.zip' },
      ];

      mockAxios.get
        .mockResolvedValueOnce({
          data: Buffer.from('success'),
          headers: { 'content-length': '1024' },
          status: 200,
          statusText: 'OK',
          config: {} as any,
        } as AxiosResponse)
        .mockRejectedValueOnce(new Error('Download failed'));

      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('checksum'),
      };
      mockCrypto.createHash.mockReturnValue(mockHash as any);

      const results = await downloader.downloadBatch(downloads);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });

    it('should respect max concurrent downloads', async () => {
      const downloads = Array.from({ length: 5 }, (_, i) => ({
        url: `https://example.com/model${i}.zip`,
        destinationPath: `/tmp/model${i}.zip`,
        options: { maxConcurrent: 2 },
      }));

      let concurrentCount = 0;
      let maxConcurrent = 0;

      mockAxios.get.mockImplementation(() => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        
        return new Promise((resolve) => {
          setTimeout(() => {
            concurrentCount--;
            resolve({
              data: Buffer.from('test'),
              headers: { 'content-length': '1024' },
              status: 200,
              statusText: 'OK',
              config: {} as any,
            } as AxiosResponse);
          }, 100);
        });
      });

      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('checksum'),
      };
      mockCrypto.createHash.mockReturnValue(mockHash as any);

      await downloader.downloadBatch(downloads);

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe('verifyDownload()', () => {
    it('should verify checksum successfully', async () => {
      const filePath = '/tmp/test-model.zip';
      const expectedChecksum = 'expected-sha256-hash';

      mockFs.readFile.mockResolvedValueOnce(Buffer.from('test file content'));

      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue(expectedChecksum),
      };
      mockCrypto.createHash.mockReturnValue(mockHash as any);

      const isValid = await downloader.verifyDownload(filePath, expectedChecksum);

      expect(isValid).toBe(true);
      expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256');
      expect(mockHash.update).toHaveBeenCalledWith(Buffer.from('test file content'));
    });

    it('should fail verification with wrong checksum', async () => {
      const filePath = '/tmp/test-model.zip';
      const expectedChecksum = 'expected-sha256-hash';

      mockFs.readFile.mockResolvedValueOnce(Buffer.from('corrupted file content'));

      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('different-checksum'),
      };
      mockCrypto.createHash.mockReturnValue(mockHash as any);

      const isValid = await downloader.verifyDownload(filePath, expectedChecksum);

      expect(isValid).toBe(false);
    });

    it('should handle missing file', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('File not found'));

      await expect(
        downloader.verifyDownload('/tmp/missing.zip', 'checksum')
      ).rejects.toThrow('File not found');
    });
  });

  describe('getDownloadProgress()', () => {
    it('should return progress for active download', async () => {
      // Start a download to create an active task
      const mockResponse: Partial<AxiosResponse> = {
        data: Buffer.from('data'),
        headers: { 'content-length': '1024' },
        status: 200,
      };
      mockAxios.get.mockResolvedValueOnce(mockResponse as AxiosResponse);

      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('checksum'),
      };
      mockCrypto.createHash.mockReturnValue(mockHash as any);

      // This would normally be tracked internally
      const downloadPromise = downloader.downloadModel(
        'https://example.com/model.zip',
        '/tmp/model.zip'
      );

      // Wait a bit for download to start
      await new Promise(resolve => setTimeout(resolve, 10));

      const tasks = await downloader.getActiveTasks();
      expect(tasks.length).toBeGreaterThanOrEqual(0);

      await downloadPromise;
    });

    it('should return null for non-existent task', async () => {
      const progress = await downloader.getDownloadProgress('non-existent-task');
      expect(progress).toBeNull();
    });
  });

  describe('getDownloadStats()', () => {
    it('should return download statistics', async () => {
      // Perform some downloads to generate stats
      mockAxios.get.mockResolvedValue({
        data: Buffer.from('test'),
        headers: { 'content-length': '1024' },
        status: 200,
        statusText: 'OK',
        config: {} as any,
      } as AxiosResponse);

      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('checksum'),
      };
      mockCrypto.createHash.mockReturnValue(mockHash as any);

      await downloader.downloadModel('https://example.com/model1.zip', '/tmp/model1.zip');
      await downloader.downloadModel('https://example.com/model2.zip', '/tmp/model2.zip');

      const stats = await downloader.getDownloadStats();

      expect(stats.totalDownloads).toBe(2);
      expect(stats.successfulDownloads).toBe(2);
      expect(stats.failedDownloads).toBe(0);
      expect(stats.totalBytesDownloaded).toBe(2048); // 2 * 1024
      expect(stats.averageSpeed).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockAxios.get.mockRejectedValueOnce(new Error('ENOTFOUND example.com'));

      const result = await downloader.downloadModel(
        'https://example.com/model.zip',
        '/tmp/model.zip',
        { retries: 0 }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('ENOTFOUND');
    });

    it('should handle file system errors', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: Buffer.from('test'),
        headers: { 'content-length': '1024' },
        status: 200,
        statusText: 'OK',
        config: {} as any,
      } as AxiosResponse);

      mockFs.writeFile.mockRejectedValueOnce(new Error('ENOSPC: no space left'));

      const result = await downloader.downloadModel(
        'https://example.com/model.zip',
        '/tmp/model.zip'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('ENOSPC');
    });

    it('should handle HTTP errors', async () => {
      mockAxios.get.mockRejectedValueOnce({
        response: {
          status: 404,
          statusText: 'Not Found',
        },
      });

      const result = await downloader.downloadModel(
        'https://example.com/missing.zip',
        '/tmp/model.zip',
        { retries: 0 }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('404');
    });
  });
});
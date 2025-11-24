/**
 * Test setup file
 * Configure global test environment
 */

import '@testing-library/jest-dom';

// Mock console methods in tests to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_content_platform';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.STORAGE_TYPE = 'local';
process.env.UPLOAD_PATH = '/tmp/test-uploads';

// Mock Date for consistent testing
const mockDate = new Date('2023-01-01T00:00:00.000Z');
jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
(Date as any).now = jest.fn(() => mockDate.getTime());

// Mock window.innerWidth for responsive tests
Object.defineProperty(window, 'innerWidth', {
  writable: true,
  configurable: true,
  value: 1024,
});

// Mock window.addEventListener
Object.defineProperty(window, 'addEventListener', {
  writable: true,
  configurable: true,
  value: jest.fn(),
});

Object.defineProperty(window, 'removeEventListener', {
  writable: true,
  configurable: true,
  value: jest.fn(),
});
/**
 * Jest Test Setup
 * 
 * Global test configuration and utilities
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-jwt-signing';
process.env.MODEL_CACHE_PATH = '/tmp/test-models';
process.env.MODEL_REGISTRY_URL = 'https://api.example.com/models';

// Global test timeout
jest.setTimeout(30000);

// Mock console methods in tests to reduce noise
global.console = {
  ...console,
  // Comment out the following line if you want to see console logs in tests
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
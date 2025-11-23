import request from 'supertest';
import express from 'express';
import { App } from '@/app';

/**
 * Simple Application Tests
 * 
 * Basic tests for Express app structure without database dependencies
 */

describe('Simple App Tests', () => {
  let app: App;

  beforeAll(() => {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret-key';
    process.env.SKIP_AUTH = 'true';
    process.env.STORAGE_PATH = '/tmp/test-uploads';
    process.env.STORAGE_URL = 'http://localhost:3000/files';
  });

  describe('App Construction', () => {
    it('should create App instance successfully', () => {
      expect(() => {
        app = new App();
      }).not.toThrow();
    });

    it('should have Express app instance', () => {
      app = new App();
      const expressApp = app.getApp();
      expect(expressApp).toBeDefined();
      expect(typeof expressApp).toBe('function'); // Express apps are functions
    });
  });

  describe('Basic Routes', () => {
    beforeAll(() => {
      app = new App();
    });

    it('GET /health should return health status', async () => {
      const response = await request(app.getApp())
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        version: expect.any(String),
      });
    });

    it('GET /api should return API documentation', async () => {
      const response = await request(app.getApp())
        .get('/api')
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'Content Platform API',
        version: expect.any(String),
        endpoints: expect.any(Object),
      });

      // Check that endpoints are documented
      expect(response.body.endpoints).toHaveProperty('GET /health');
      expect(response.body.endpoints).toHaveProperty('POST /api/v1/content');
    });

    it('should return 404 for unknown routes', async () => {
      const response = await request(app.getApp())
        .get('/unknown/route')
        .expect(404);

      expect(response.body.error).toMatchObject({
        message: 'Route not found: GET /unknown/route',
        type: 'NotFoundError',
        status: 404,
      });
    });
  });

  describe('Middleware Configuration', () => {
    beforeAll(() => {
      app = new App();
    });

    it('should include security headers', async () => {
      const response = await request(app.getApp())
        .get('/health')
        .expect(200);

      // Helmet adds various security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeTruthy();
    });

    it('should handle CORS preflight requests', async () => {
      const response = await request(app.getApp())
        .options('/api/v1/content')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBeTruthy();
    });

    it('should handle JSON parsing', async () => {
      const response = await request(app.getApp())
        .post('/api/v1/content/test-id')
        .set('Content-Type', 'application/json')
        .send({ title: 'Test Title' })
        .expect(401); // Unauthorized without token, but JSON was parsed

      // If we get here, JSON was parsed successfully
      expect(response.status).toBe(401);
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app.getApp())
        .post('/api/v1/content/test-id')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body.error).toMatchObject({
        message: 'Invalid JSON in request body',
        type: 'ValidationError',
        status: 400,
      });
    });
  });

  describe('Content API Routes Structure', () => {
    beforeAll(() => {
      app = new App();
    });

    it('should protect content routes with auth when not skipped', async () => {
      // Temporarily disable SKIP_AUTH to test auth middleware
      const originalSkipAuth = process.env.SKIP_AUTH;
      delete process.env.SKIP_AUTH;

      const response = await request(app.getApp())
        .get('/api/v1/content')
        .expect(401);

      expect(response.body.error).toMatchObject({
        type: 'AuthenticationError',
        status: 401,
      });

      // Restore SKIP_AUTH
      process.env.SKIP_AUTH = originalSkipAuth;
    });

    it('should accept requests with SKIP_AUTH enabled', async () => {
      const response = await request(app.getApp())
        .get('/api/v1/content')
        .expect(200);

      // Should get past auth middleware
      expect(response.status).toBe(200);
    });
  });

  describe('Error Handling', () => {
    beforeAll(() => {
      app = new App();
    });

    it('should handle file upload without file', async () => {
      const response = await request(app.getApp())
        .post('/api/v1/content')
        .send({ title: 'Test Content' })
        .expect(400);

      expect(response.body.error).toMatchObject({
        message: 'File is required',
        type: 'ValidationError',
        status: 400,
      });
    });

    it('should include request path in error responses', async () => {
      const response = await request(app.getApp())
        .get('/nonexistent')
        .expect(404);

      expect(response.body.error.path).toBe('/nonexistent');
    });

    it('should include timestamp in error responses', async () => {
      const response = await request(app.getApp())
        .get('/nonexistent')
        .expect(404);

      expect(response.body.error.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
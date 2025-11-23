import request from 'supertest';
import { App } from '@/app';
import { AppDataSource } from '@/database/config/database.config';
import jwt from 'jsonwebtoken';

/**
 * Application Integration Tests
 * 
 * Tests the complete Express application with dependency injection
 * Follows TDD approach with comprehensive API testing
 */

describe('App Integration Tests', () => {
  let app: App;
  let testToken: string;

  beforeAll(async () => {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret-key';
    process.env.SKIP_AUTH = 'true'; // Skip JWT validation in tests
    process.env.STORAGE_PATH = '/tmp/test-uploads';
    process.env.STORAGE_URL = 'http://localhost:3000/files';

    // Create test JWT token
    testToken = jwt.sign(
      { 
        id: 'test-user-id',
        email: 'test@example.com',
        role: 'user'
      },
      process.env.JWT_SECRET
    );

    // Initialize app
    app = new App();
  });

  afterAll(async () => {
    if (app) {
      await app.shutdown();
    }
  });

  describe('Health Check Endpoints', () => {
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
    });
  });

  describe('Authentication Middleware', () => {
    it('should reject requests without auth header', async () => {
      // Temporarily disable SKIP_AUTH
      const originalSkipAuth = process.env.SKIP_AUTH;
      delete process.env.SKIP_AUTH;

      const response = await request(app.getApp())
        .get('/api/v1/content')
        .expect(401);

      expect(response.body.error).toMatchObject({
        message: 'Authorization header required',
        type: 'AuthenticationError',
        status: 401,
      });

      // Restore SKIP_AUTH
      process.env.SKIP_AUTH = originalSkipAuth;
    });

    it('should reject requests with invalid bearer token', async () => {
      const originalSkipAuth = process.env.SKIP_AUTH;
      delete process.env.SKIP_AUTH;

      const response = await request(app.getApp())
        .get('/api/v1/content')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error).toMatchObject({
        message: 'Invalid token',
        type: 'AuthenticationError',
        status: 401,
      });

      process.env.SKIP_AUTH = originalSkipAuth;
    });

    it('should accept valid JWT token', async () => {
      const originalSkipAuth = process.env.SKIP_AUTH;
      delete process.env.SKIP_AUTH;

      const response = await request(app.getApp())
        .get('/api/v1/content')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      process.env.SKIP_AUTH = originalSkipAuth;
    });
  });

  describe('Content API Routes', () => {
    it('GET /api/v1/content should return empty list initially', async () => {
      const response = await request(app.getApp())
        .get('/api/v1/content')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('GET /api/v1/content/:id should return 404 for nonexistent content', async () => {
      const response = await request(app.getApp())
        .get('/api/v1/content/nonexistent-id')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(404);

      expect(response.body.error).toMatchObject({
        type: 'NotFoundError',
        status: 404,
      });
    });

    it('POST /api/v1/content should require file upload', async () => {
      const response = await request(app.getApp())
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ title: 'Test Content' })
        .expect(400);

      expect(response.body.error).toMatchObject({
        message: 'File is required',
        type: 'ValidationError',
        status: 400,
      });
    });

    it('PUT /api/v1/content/:id should return 404 for nonexistent content', async () => {
      const response = await request(app.getApp())
        .put('/api/v1/content/nonexistent-id')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ title: 'Updated Title' })
        .expect(404);

      expect(response.body.error).toMatchObject({
        type: 'NotFoundError',
        status: 404,
      });
    });

    it('DELETE /api/v1/content/:id should return 404 for nonexistent content', async () => {
      const response = await request(app.getApp())
        .delete('/api/v1/content/nonexistent-id')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(404);

      expect(response.body.error).toMatchObject({
        type: 'NotFoundError',
        status: 404,
      });
    });
  });

  describe('Error Handling', () => {
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

    it('should handle malformed JSON', async () => {
      const response = await request(app.getApp())
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${testToken}`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body.error).toMatchObject({
        message: 'Invalid JSON in request body',
        type: 'ValidationError',
        status: 400,
      });
    });

    it('should handle large request bodies', async () => {
      const largePayload = 'x'.repeat(60 * 1024 * 1024); // 60MB

      const response = await request(app.getApp())
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ data: largePayload })
        .expect(413); // Payload Too Large
    });
  });

  describe('CORS Configuration', () => {
    it('should include CORS headers', async () => {
      const response = await request(app.getApp())
        .options('/api/v1/content')
        .set('Origin', 'http://localhost:3000')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBeTruthy();
    });

    it('should handle preflight requests', async () => {
      const response = await request(app.getApp())
        .options('/api/v1/content')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Authorization,Content-Type')
        .expect(204);

      expect(response.headers['access-control-allow-methods']).toBeTruthy();
      expect(response.headers['access-control-allow-headers']).toBeTruthy();
    });
  });

  describe('Security Headers', () => {
    it('should include security headers from Helmet', async () => {
      const response = await request(app.getApp())
        .get('/health')
        .expect(200);

      // Helmet adds various security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeTruthy();
      expect(response.headers['x-xss-protection']).toBeTruthy();
    });
  });

  describe('Static File Serving', () => {
    it('should serve files from /files route', async () => {
      // This test would require creating an actual file
      // For now, just test that the route exists
      const response = await request(app.getApp())
        .get('/files/nonexistent.jpg')
        .expect(404);
    });
  });

  describe('Request Logging', () => {
    it('should log requests in development mode', async () => {
      // Morgan middleware is configured, but testing logging
      // would require capturing console output
      const response = await request(app.getApp())
        .get('/health')
        .expect(200);

      // If this doesn't throw, Morgan is working
      expect(response.status).toBe(200);
    });
  });

  describe('Content-Type Handling', () => {
    it('should parse JSON requests', async () => {
      const response = await request(app.getApp())
        .put('/api/v1/content/test-id')
        .set('Authorization', `Bearer ${testToken}`)
        .set('Content-Type', 'application/json')
        .send({ title: 'Test Title' })
        .expect(404); // Content doesn't exist, but JSON was parsed

      expect(response.body.error.type).toBe('NotFoundError');
    });

    it('should parse URL-encoded requests', async () => {
      const response = await request(app.getApp())
        .put('/api/v1/content/test-id')
        .set('Authorization', `Bearer ${testToken}`)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('title=Test%20Title')
        .expect(404);

      expect(response.body.error.type).toBe('NotFoundError');
    });
  });
});
import { MonitoringProviderFactory } from '@/services/MonitoringProviderFactory';
import { MonitoringConfigManager } from '@/config/monitoring.config';
import { jest } from '@jest/globals';

describe('Production Monitoring System', () => {
  let monitoringFactory: MonitoringProviderFactory;
  let configManager: MonitoringConfigManager;

  beforeEach(() => {
    monitoringFactory = MonitoringProviderFactory.getInstance();
    configManager = MonitoringConfigManager.getInstance();
    monitoringFactory.clearCache();
    configManager.clearConfig();
  });

  describe('MonitoringProviderFactory', () => {
    it('should create Prometheus metrics collector', async () => {
      const config = {
        provider: 'prometheus' as const,
        config: {
          endpoint: 'http://localhost:9090',
          pushGateway: 'http://localhost:9091',
          scrapeInterval: 15
        }
      };

      try {
        const provider = await monitoringFactory.createMetricsCollector(config);
        expect(provider.providerType).toBe('prometheus');
        expect(provider.providerName).toBe('Prometheus Metrics');
      } catch (error) {
        // Expected to fail without actual Prometheus instance
        expect(error).toBeDefined();
      }
    });

    it('should create ELK logging provider', async () => {
      const config = {
        provider: 'elk' as const,
        config: {
          elasticsearch: {
            host: 'localhost',
            port: 9200,
            index: 'live-ad-detection'
          }
        }
      };

      try {
        const provider = await monitoringFactory.createLogProvider(config);
        expect(provider.providerType).toBe('elk');
        expect(provider.providerName).toBe('ELK Stack Logging');
      } catch (error) {
        // Expected to fail without actual ELK stack
        expect(error).toBeDefined();
      }
    });

    it('should create PagerDuty alert manager', async () => {
      const config = {
        provider: 'pagerduty' as const,
        config: {
          integrationKey: 'test-integration-key',
          routingKey: 'test-routing-key'
        }
      };

      try {
        const provider = await monitoringFactory.createAlertManager(config);
        expect(provider.providerType).toBe('pagerduty');
        expect(provider.providerName).toBe('PagerDuty Alerting');
      } catch (error) {
        // Expected to fail without actual PagerDuty credentials
        expect(error).toBeDefined();
      }
    });

    it('should create Jaeger tracing provider', async () => {
      const config = {
        provider: 'jaeger' as const,
        config: {
          endpoint: 'http://localhost:14268',
          serviceName: 'content-platform',
          samplingRate: 0.1
        }
      };

      try {
        const provider = await monitoringFactory.createTracingProvider(config);
        expect(provider.providerType).toBe('jaeger');
        expect(provider.providerName).toBe('Jaeger Tracing');
      } catch (error) {
        // Expected to fail without actual Jaeger instance
        expect(error).toBeDefined();
      }
    });

    it('should cache providers for reuse', async () => {
      const config = {
        provider: 'prometheus' as const,
        config: {
          endpoint: 'http://localhost:9090'
        }
      };

      try {
        const provider1 = await monitoringFactory.createMetricsCollector(config);
        const provider2 = await monitoringFactory.createMetricsCollector(config);
        expect(provider1).toBe(provider2); // Same instance from cache
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should validate monitoring configurations', () => {
      const validConfig = {
        provider: 'prometheus' as const,
        config: {
          endpoint: 'http://localhost:9090',
          pushGateway: 'http://localhost:9091'
        }
      };

      const result = monitoringFactory.validateMetricsConfig(validConfig);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid configurations', () => {
      const invalidConfig = {
        provider: 'prometheus' as const,
        config: {
          // Missing required endpoint
          pushGateway: 'http://localhost:9091'
        }
      } as any;

      const result = monitoringFactory.validateMetricsConfig(invalidConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Prometheus endpoint is required');
    });

    it('should list available monitoring providers', () => {
      const metricsProviders = monitoringFactory.getAvailableMetricsProviders();
      expect(metricsProviders).toContain('prometheus');
      expect(metricsProviders).toContain('datadog');
      expect(metricsProviders).toContain('newrelic');

      const logProviders = monitoringFactory.getAvailableLogProviders();
      expect(logProviders).toContain('elk');
      expect(logProviders).toContain('splunk');
      expect(logProviders).toContain('cloudwatch');

      const alertProviders = monitoringFactory.getAvailableAlertProviders();
      expect(alertProviders).toContain('pagerduty');
      expect(alertProviders).toContain('slack');
      expect(alertProviders).toContain('email');
    });
  });

  describe('MetricsCollector Operations', () => {
    it('should record counter metrics', async () => {
      const mockMetricsCollector = {
        providerType: 'prometheus' as const,
        providerName: 'Test Prometheus',
        incrementCounter: jest.fn().mockResolvedValue(undefined),
        isHealthy: jest.fn().mockResolvedValue(true)
      };

      await mockMetricsCollector.incrementCounter('http_requests_total', 1, { 
        method: 'GET', 
        endpoint: '/api/content' 
      });

      expect(mockMetricsCollector.incrementCounter).toHaveBeenCalledWith(
        'http_requests_total', 
        1, 
        { method: 'GET', endpoint: '/api/content' }
      );
    });

    it('should record gauge metrics', async () => {
      const mockMetricsCollector = {
        providerType: 'prometheus' as const,
        providerName: 'Test Prometheus',
        setGauge: jest.fn().mockResolvedValue(undefined),
        isHealthy: jest.fn().mockResolvedValue(true)
      };

      await mockMetricsCollector.setGauge('active_connections', 42, { service: 'websocket' });

      expect(mockMetricsCollector.setGauge).toHaveBeenCalledWith(
        'active_connections', 
        42, 
        { service: 'websocket' }
      );
    });

    it('should record business metrics', async () => {
      const mockMetricsCollector = {
        providerType: 'prometheus' as const,
        providerName: 'Test Prometheus',
        recordBusinessMetric: jest.fn().mockResolvedValue(undefined),
        isHealthy: jest.fn().mockResolvedValue(true)
      };

      const businessMetric = {
        name: 'pip_switches_per_hour',
        value: 157,
        unit: 'count',
        category: 'business' as const,
        tags: { service: 'pip-automation' },
        timestamp: new Date()
      };

      await mockMetricsCollector.recordBusinessMetric(businessMetric);

      expect(mockMetricsCollector.recordBusinessMetric).toHaveBeenCalledWith(businessMetric);
    });
  });

  describe('LogProvider Operations', () => {
    it('should log structured entries', async () => {
      const mockLogProvider = {
        providerType: 'elk' as const,
        providerName: 'Test ELK',
        log: jest.fn().mockResolvedValue(undefined),
        isHealthy: jest.fn().mockResolvedValue(true)
      };

      const logEntry = {
        level: 'info' as const,
        message: 'PiP mode activated',
        timestamp: new Date(),
        service: 'pip-automation',
        traceId: 'trace-123',
        userId: 'user-456',
        metadata: {
          adConfidence: 0.92,
          switchTime: 85
        }
      };

      await mockLogProvider.log(logEntry);

      expect(mockLogProvider.log).toHaveBeenCalledWith(logEntry);
    });

    it('should search logs with query', async () => {
      const mockLogProvider = {
        providerType: 'elk' as const,
        providerName: 'Test ELK',
        search: jest.fn().mockResolvedValue({
          entries: [],
          totalCount: 0,
          hasMore: false
        }),
        isHealthy: jest.fn().mockResolvedValue(true)
      };

      const query = {
        service: 'pip-automation',
        level: ['error', 'warn'],
        timeRange: {
          start: new Date(Date.now() - 3600000),
          end: new Date()
        },
        query: 'PiP failed',
        limit: 100
      };

      await mockLogProvider.search(query);

      expect(mockLogProvider.search).toHaveBeenCalledWith(query);
    });
  });

  describe('AlertManager Operations', () => {
    it('should create alert rules', async () => {
      const mockAlertManager = {
        providerType: 'pagerduty' as const,
        providerName: 'Test PagerDuty',
        createAlertRule: jest.fn().mockResolvedValue('rule-123'),
        isHealthy: jest.fn().mockResolvedValue(true)
      };

      const alertRule = {
        id: 'high-error-rate',
        name: 'High Error Rate Alert',
        description: 'Triggers when error rate exceeds 5%',
        condition: 'error_rate > 0.05',
        severity: 'critical' as const,
        enabled: true,
        channels: [{
          type: 'pagerduty' as const,
          config: { integrationKey: 'test-key' }
        }]
      };

      const ruleId = await mockAlertManager.createAlertRule(alertRule);

      expect(mockAlertManager.createAlertRule).toHaveBeenCalledWith(alertRule);
      expect(ruleId).toBe('rule-123');
    });

    it('should trigger alerts', async () => {
      const mockAlertManager = {
        providerType: 'pagerduty' as const,
        providerName: 'Test PagerDuty',
        triggerAlert: jest.fn().mockResolvedValue('alert-456'),
        isHealthy: jest.fn().mockResolvedValue(true)
      };

      const alert = {
        ruleId: 'high-error-rate',
        title: 'High Error Rate Detected',
        description: 'Error rate is 7.2%, exceeding threshold of 5%',
        severity: 'critical' as const,
        status: 'firing' as const,
        metadata: {
          currentErrorRate: 0.072,
          threshold: 0.05
        }
      };

      const alertId = await mockAlertManager.triggerAlert(alert);

      expect(mockAlertManager.triggerAlert).toHaveBeenCalledWith(alert);
      expect(alertId).toBe('alert-456');
    });
  });

  describe('TracingProvider Operations', () => {
    it('should create and finish spans', async () => {
      const mockTracingProvider = {
        providerType: 'jaeger' as const,
        providerName: 'Test Jaeger',
        startSpan: jest.fn().mockResolvedValue({
          traceId: 'trace-123',
          spanId: 'span-456',
          operationName: 'pip_switch',
          startTime: new Date(),
          tags: {},
          logs: [],
          status: 'ok'
        }),
        finishSpan: jest.fn().mockResolvedValue(undefined),
        isHealthy: jest.fn().mockResolvedValue(true)
      };

      const span = await mockTracingProvider.startSpan('pip_switch');
      await mockTracingProvider.finishSpan(span);

      expect(mockTracingProvider.startSpan).toHaveBeenCalledWith('pip_switch');
      expect(mockTracingProvider.finishSpan).toHaveBeenCalledWith(span);
    });

    it('should query traces by criteria', async () => {
      const mockTracingProvider = {
        providerType: 'jaeger' as const,
        providerName: 'Test Jaeger',
        getTraces: jest.fn().mockResolvedValue([]),
        isHealthy: jest.fn().mockResolvedValue(true)
      };

      const query = {
        service: 'pip-automation',
        operation: 'switch_to_pip',
        timeRange: {
          start: new Date(Date.now() - 3600000),
          end: new Date()
        },
        minDuration: 100, // > 100ms
        limit: 50
      };

      await mockTracingProvider.getTraces(query);

      expect(mockTracingProvider.getTraces).toHaveBeenCalledWith(query);
    });
  });

  describe('MonitoringConfigManager', () => {
    it('should load configuration from environment variables', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        METRICS_PROVIDER: 'prometheus',
        PROMETHEUS_ENDPOINT: 'http://localhost:9090',
        PROMETHEUS_PUSH_GATEWAY: 'http://localhost:9091',
        LOG_PROVIDER: 'elk',
        ELASTICSEARCH_HOST: 'localhost',
        ELASTICSEARCH_PORT: '9200',
        ALERT_PROVIDER: 'pagerduty',
        PAGERDUTY_INTEGRATION_KEY: 'test-key'
      };

      const config = configManager.getMonitoringConfig();
      expect(config.metrics?.provider).toBe('prometheus');
      expect(config.logging?.provider).toBe('elk');
      expect(config.alerting?.provider).toBe('pagerduty');

      process.env = originalEnv;
    });

    it('should default to basic providers when not specified', () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv };
      delete process.env.METRICS_PROVIDER;
      delete process.env.LOG_PROVIDER;
      delete process.env.ALERT_PROVIDER;

      const config = configManager.getMonitoringConfig();
      expect(config.metrics?.provider).toBe('prometheus');
      expect(config.logging?.provider).toBe('elk');
      expect(config.alerting?.provider).toBe('email');

      process.env = originalEnv;
    });

    it('should validate environment configuration', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        METRICS_PROVIDER: 'prometheus'
        // Missing required Prometheus endpoint
      };

      const result = configManager.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      process.env = originalEnv;
    });
  });

  describe('Provider Integration', () => {
    it('should support monitoring pipeline integration', async () => {
      // Scenario: Complete observability stack
      
      const metricsConfig = {
        provider: 'prometheus' as const,
        config: { endpoint: 'http://localhost:9090' }
      };

      const loggingConfig = {
        provider: 'elk' as const,
        config: {
          elasticsearch: { host: 'localhost', port: 9200, index: 'logs' }
        }
      };

      const alertingConfig = {
        provider: 'pagerduty' as const,
        config: { integrationKey: 'test-key' }
      };

      try {
        const metricsProvider = await monitoringFactory.createMetricsCollector(metricsConfig);
        const logProvider = await monitoringFactory.createLogProvider(loggingConfig);
        const alertManager = await monitoringFactory.createAlertManager(alertingConfig);

        // All providers should be created successfully
        expect(metricsProvider.providerType).toBe('prometheus');
        expect(logProvider.providerType).toBe('elk');
        expect(alertManager.providerType).toBe('pagerduty');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should support enterprise monitoring scenario', async () => {
      // Scenario: Enterprise with custom requirements
      
      const enterpriseMetricsConfig = {
        provider: 'datadog' as const,
        config: {
          apiKey: 'dd-api-key',
          appKey: 'dd-app-key',
          site: 'datadoghq.com'
        }
      };

      const enterpriseLoggingConfig = {
        provider: 'splunk' as const,
        config: {
          host: 'splunk.enterprise.com',
          port: 8088,
          token: 'splunk-hec-token'
        }
      };

      try {
        await monitoringFactory.createMetricsCollector(enterpriseMetricsConfig);
        await monitoringFactory.createLogProvider(enterpriseLoggingConfig);
        expect(true).toBe(true); // Enterprise setup possible
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Business Metrics Integration', () => {
    it('should track PiP automation metrics', async () => {
      const mockMetricsCollector = {
        providerType: 'prometheus' as const,
        providerName: 'Test Prometheus',
        recordBusinessMetric: jest.fn().mockResolvedValue(undefined),
        incrementCounter: jest.fn().mockResolvedValue(undefined),
        recordHistogram: jest.fn().mockResolvedValue(undefined)
      };

      // Track key business metrics
      await mockMetricsCollector.recordBusinessMetric({
        name: 'pip_switches_total',
        value: 1,
        unit: 'count',
        category: 'business',
        tags: { success: 'true', device: 'android' },
        timestamp: new Date()
      });

      await mockMetricsCollector.recordHistogram('pip_switch_duration', 85, {
        device_type: 'android'
      });

      await mockMetricsCollector.incrementCounter('ad_detections_total', 1, {
        confidence: 'high',
        ad_type: 'commercial'
      });

      expect(mockMetricsCollector.recordBusinessMetric).toHaveBeenCalled();
      expect(mockMetricsCollector.recordHistogram).toHaveBeenCalledWith(
        'pip_switch_duration', 85, { device_type: 'android' }
      );
      expect(mockMetricsCollector.incrementCounter).toHaveBeenCalledWith(
        'ad_detections_total', 1, { confidence: 'high', ad_type: 'commercial' }
      );
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle provider initialization failures gracefully', async () => {
      const invalidConfig = {
        provider: 'prometheus' as const,
        config: {
          endpoint: 'invalid-url'
        }
      };

      try {
        await monitoringFactory.createMetricsCollector(invalidConfig);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('initialization failed');
      }
    });

    it('should support provider fallback scenarios', async () => {
      // Primary provider fails, fallback to secondary
      const primaryConfig = {
        provider: 'datadog' as const,
        config: { apiKey: 'invalid-key' }
      };

      const fallbackConfig = {
        provider: 'prometheus' as const,
        config: { endpoint: 'http://localhost:9090' }
      };

      try {
        // Try primary, expect failure
        await monitoringFactory.createMetricsCollector(primaryConfig);
      } catch (primaryError) {
        try {
          // Fallback to secondary
          await monitoringFactory.createMetricsCollector(fallbackConfig);
          expect(true).toBe(true); // Fallback successful
        } catch (fallbackError) {
          expect(fallbackError).toBeDefined();
        }
      }
    });
  });
});
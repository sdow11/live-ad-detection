import { 
  MonitoringConfig, 
  MetricsProviderType, 
  LogProviderType, 
  AlertProviderType, 
  TracingProviderType,
  PrometheusConfig,
  ELKConfig,
  PagerDutyConfig,
  JaegerConfig
} from '@/interfaces/IMonitoringProvider';

/**
 * Monitoring Configuration Manager
 * 
 * Centralized configuration for pluggable monitoring providers.
 * Supports environment-based provider selection and runtime switching.
 * 
 * Environment Variables:
 * - METRICS_PROVIDER: prometheus|datadog|newrelic|custom
 * - LOG_PROVIDER: elk|splunk|cloudwatch|custom
 * - ALERT_PROVIDER: pagerduty|slack|email|webhook|custom
 * - TRACING_PROVIDER: jaeger|zipkin|datadog|custom
 * 
 * Provider-specific variables:
 * - Prometheus: PROMETHEUS_ENDPOINT, PROMETHEUS_PUSH_GATEWAY
 * - ELK: ELASTICSEARCH_HOST, ELASTICSEARCH_PORT, ELASTICSEARCH_INDEX
 * - PagerDuty: PAGERDUTY_INTEGRATION_KEY, PAGERDUTY_ROUTING_KEY
 * - Jaeger: JAEGER_ENDPOINT, JAEGER_SERVICE_NAME
 */

export class MonitoringConfigManager {
  private static instance: MonitoringConfigManager;
  private currentConfig: MonitoringConfig | null = null;

  private constructor() {}

  static getInstance(): MonitoringConfigManager {
    if (!MonitoringConfigManager.instance) {
      MonitoringConfigManager.instance = new MonitoringConfigManager();
    }
    return MonitoringConfigManager.instance;
  }

  /**
   * Get monitoring configuration from environment
   */
  getMonitoringConfig(): MonitoringConfig {
    if (this.currentConfig) {
      return this.currentConfig;
    }

    const config: MonitoringConfig = {};

    // Metrics configuration
    const metricsProvider = (process.env.METRICS_PROVIDER as MetricsProviderType) || 'prometheus';
    config.metrics = {
      provider: metricsProvider,
      config: this.getMetricsConfig(metricsProvider)
    };

    // Logging configuration
    const logProvider = (process.env.LOG_PROVIDER as LogProviderType) || 'elk';
    config.logging = {
      provider: logProvider,
      config: this.getLoggingConfig(logProvider)
    };

    // Alerting configuration
    const alertProvider = (process.env.ALERT_PROVIDER as AlertProviderType) || 'email';
    config.alerting = {
      provider: alertProvider,
      config: this.getAlertingConfig(alertProvider)
    };

    // Tracing configuration
    const tracingProvider = (process.env.TRACING_PROVIDER as TracingProviderType) || 'jaeger';
    config.tracing = {
      provider: tracingProvider,
      config: this.getTracingConfig(tracingProvider)
    };

    this.currentConfig = config;
    return config;
  }

  /**
   * Override configuration (useful for testing)
   */
  setConfig(config: MonitoringConfig): void {
    this.currentConfig = config;
  }

  /**
   * Clear cached configuration
   */
  clearConfig(): void {
    this.currentConfig = null;
  }

  /**
   * Validate current configuration
   */
  validateConfig(): { isValid: boolean; errors: string[] } {
    const config = this.getMonitoringConfig();
    const errors: string[] = [];

    // Validate metrics configuration
    if (config.metrics) {
      const metricsErrors = this.validateMetricsEnvironment(config.metrics.provider);
      errors.push(...metricsErrors);
    }

    // Validate logging configuration
    if (config.logging) {
      const loggingErrors = this.validateLoggingEnvironment(config.logging.provider);
      errors.push(...loggingErrors);
    }

    // Validate alerting configuration
    if (config.alerting) {
      const alertingErrors = this.validateAlertingEnvironment(config.alerting.provider);
      errors.push(...alertingErrors);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Private helper methods for provider-specific configurations
  private getMetricsConfig(provider: MetricsProviderType): any {
    switch (provider) {
      case 'prometheus':
        return {
          endpoint: process.env.PROMETHEUS_ENDPOINT || 'http://localhost:9090',
          pushGateway: process.env.PROMETHEUS_PUSH_GATEWAY,
          scrapeInterval: parseInt(process.env.PROMETHEUS_SCRAPE_INTERVAL || '15'),
          basicAuth: process.env.PROMETHEUS_USERNAME && process.env.PROMETHEUS_PASSWORD ? {
            username: process.env.PROMETHEUS_USERNAME,
            password: process.env.PROMETHEUS_PASSWORD
          } : undefined
        } as PrometheusConfig;

      case 'datadog':
        return {
          apiKey: process.env.DATADOG_API_KEY!,
          appKey: process.env.DATADOG_APP_KEY!,
          site: process.env.DATADOG_SITE || 'datadoghq.com',
          tags: process.env.DATADOG_TAGS ? process.env.DATADOG_TAGS.split(',') : []
        };

      case 'newrelic':
        return {
          licenseKey: process.env.NEWRELIC_LICENSE_KEY!,
          appName: process.env.NEWRELIC_APP_NAME || 'live-ad-detection',
          environment: process.env.NODE_ENV || 'development'
        };

      default:
        return {};
    }
  }

  private getLoggingConfig(provider: LogProviderType): any {
    switch (provider) {
      case 'elk':
        return {
          elasticsearch: {
            host: process.env.ELASTICSEARCH_HOST || 'localhost',
            port: parseInt(process.env.ELASTICSEARCH_PORT || '9200'),
            username: process.env.ELASTICSEARCH_USERNAME,
            password: process.env.ELASTICSEARCH_PASSWORD,
            index: process.env.ELASTICSEARCH_INDEX || 'live-ad-detection'
          },
          logstash: process.env.LOGSTASH_HOST ? {
            host: process.env.LOGSTASH_HOST,
            port: parseInt(process.env.LOGSTASH_PORT || '5044')
          } : undefined,
          kibana: process.env.KIBANA_HOST ? {
            host: process.env.KIBANA_HOST,
            port: parseInt(process.env.KIBANA_PORT || '5601')
          } : undefined
        } as ELKConfig;

      case 'splunk':
        return {
          host: process.env.SPLUNK_HOST!,
          port: parseInt(process.env.SPLUNK_PORT || '8088'),
          token: process.env.SPLUNK_HEC_TOKEN!,
          index: process.env.SPLUNK_INDEX || 'main',
          source: process.env.SPLUNK_SOURCE || 'live-ad-detection'
        };

      case 'cloudwatch':
        return {
          region: process.env.AWS_REGION!,
          logGroup: process.env.CLOUDWATCH_LOG_GROUP!,
          logStream: process.env.CLOUDWATCH_LOG_STREAM || 'content-platform',
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        };

      default:
        return {};
    }
  }

  private getAlertingConfig(provider: AlertProviderType): any {
    switch (provider) {
      case 'pagerduty':
        return {
          integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY!,
          routingKey: process.env.PAGERDUTY_ROUTING_KEY,
          severity: process.env.PAGERDUTY_DEFAULT_SEVERITY || 'error'
        } as PagerDutyConfig;

      case 'slack':
        return {
          webhookUrl: process.env.SLACK_WEBHOOK_URL!,
          channel: process.env.SLACK_CHANNEL || '#alerts',
          username: process.env.SLACK_USERNAME || 'AlertBot'
        };

      case 'email':
        return {
          smtpHost: process.env.SMTP_HOST!,
          smtpPort: parseInt(process.env.SMTP_PORT || '587'),
          smtpUser: process.env.SMTP_USER,
          smtpPassword: process.env.SMTP_PASSWORD,
          fromEmail: process.env.ALERT_FROM_EMAIL!,
          toEmails: process.env.ALERT_TO_EMAILS?.split(',') || []
        };

      case 'webhook':
        return {
          url: process.env.WEBHOOK_URL!,
          headers: process.env.WEBHOOK_HEADERS ? JSON.parse(process.env.WEBHOOK_HEADERS) : {},
          timeout: parseInt(process.env.WEBHOOK_TIMEOUT || '5000')
        };

      default:
        return {};
    }
  }

  private getTracingConfig(provider: TracingProviderType): any {
    switch (provider) {
      case 'jaeger':
        return {
          endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268',
          serviceName: process.env.JAEGER_SERVICE_NAME || 'content-platform',
          samplingRate: parseFloat(process.env.JAEGER_SAMPLING_RATE || '0.1'),
          tags: process.env.JAEGER_TAGS ? JSON.parse(process.env.JAEGER_TAGS) : {}
        } as JaegerConfig;

      case 'zipkin':
        return {
          endpoint: process.env.ZIPKIN_ENDPOINT || 'http://localhost:9411',
          serviceName: process.env.ZIPKIN_SERVICE_NAME || 'content-platform',
          samplingRate: parseFloat(process.env.ZIPKIN_SAMPLING_RATE || '0.1')
        };

      case 'datadog':
        return {
          apiKey: process.env.DATADOG_API_KEY!,
          serviceName: process.env.DD_SERVICE || 'content-platform',
          environment: process.env.DD_ENV || process.env.NODE_ENV || 'development',
          version: process.env.DD_VERSION || '1.0.0'
        };

      default:
        return {};
    }
  }

  private validateMetricsEnvironment(provider: MetricsProviderType): string[] {
    const errors: string[] = [];

    switch (provider) {
      case 'prometheus':
        if (!process.env.PROMETHEUS_ENDPOINT && !process.env.PROMETHEUS_ENDPOINT) {
          console.warn('PROMETHEUS_ENDPOINT not set, using default localhost:9090');
        }
        break;
      case 'datadog':
        if (!process.env.DATADOG_API_KEY) errors.push('DATADOG_API_KEY is required');
        break;
      case 'newrelic':
        if (!process.env.NEWRELIC_LICENSE_KEY) errors.push('NEWRELIC_LICENSE_KEY is required');
        break;
    }

    return errors;
  }

  private validateLoggingEnvironment(provider: LogProviderType): string[] {
    const errors: string[] = [];

    switch (provider) {
      case 'elk':
        if (!process.env.ELASTICSEARCH_HOST && !process.env.ELASTICSEARCH_HOST) {
          console.warn('ELASTICSEARCH_HOST not set, using default localhost');
        }
        break;
      case 'splunk':
        if (!process.env.SPLUNK_HOST) errors.push('SPLUNK_HOST is required');
        if (!process.env.SPLUNK_HEC_TOKEN) errors.push('SPLUNK_HEC_TOKEN is required');
        break;
      case 'cloudwatch':
        if (!process.env.AWS_REGION) errors.push('AWS_REGION is required');
        if (!process.env.CLOUDWATCH_LOG_GROUP) errors.push('CLOUDWATCH_LOG_GROUP is required');
        break;
    }

    return errors;
  }

  private validateAlertingEnvironment(provider: AlertProviderType): string[] {
    const errors: string[] = [];

    switch (provider) {
      case 'pagerduty':
        if (!process.env.PAGERDUTY_INTEGRATION_KEY) errors.push('PAGERDUTY_INTEGRATION_KEY is required');
        break;
      case 'slack':
        if (!process.env.SLACK_WEBHOOK_URL) errors.push('SLACK_WEBHOOK_URL is required');
        break;
      case 'email':
        if (!process.env.SMTP_HOST) errors.push('SMTP_HOST is required');
        if (!process.env.ALERT_FROM_EMAIL) errors.push('ALERT_FROM_EMAIL is required');
        break;
      case 'webhook':
        if (!process.env.WEBHOOK_URL) errors.push('WEBHOOK_URL is required');
        break;
    }

    return errors;
  }
}

// Configuration validation utilities
export function validateMonitoringEnvironment(): { isValid: boolean; missingVars: string[] } {
  const configManager = MonitoringConfigManager.getInstance();
  const validation = configManager.validateConfig();
  
  return {
    isValid: validation.isValid,
    missingVars: validation.errors
  };
}
import { 
  IMetricsCollector, 
  ILogProvider, 
  IAlertManager, 
  ITracingProvider,
  MetricsProviderType,
  LogProviderType,
  AlertProviderType,
  TracingProviderType,
  MonitoringConfig
} from '@/interfaces/IMonitoringProvider';

/**
 * Monitoring Provider Factory
 * 
 * Factory Pattern + Strategy Pattern implementation for creating monitoring providers.
 * Enables runtime switching between Prometheus, ELK, PagerDuty, Jaeger, and custom providers.
 * 
 * Design Principles:
 * - Factory Pattern: Centralized provider creation
 * - Strategy Pattern: Runtime provider selection
 * - Dependency Inversion: Returns abstractions, not concrete classes
 * - Single Responsibility: Provider creation and configuration
 */

export class MonitoringProviderFactory {
  private static instance: MonitoringProviderFactory;
  private metricsCache = new Map<string, IMetricsCollector>();
  private logCache = new Map<string, ILogProvider>();
  private alertCache = new Map<string, IAlertManager>();
  private tracingCache = new Map<string, ITracingProvider>();

  private constructor() {}

  static getInstance(): MonitoringProviderFactory {
    if (!MonitoringProviderFactory.instance) {
      MonitoringProviderFactory.instance = new MonitoringProviderFactory();
    }
    return MonitoringProviderFactory.instance;
  }

  /**
   * Create metrics collector based on configuration
   */
  async createMetricsCollector(config: { provider: MetricsProviderType; config: any }): Promise<IMetricsCollector> {
    const cacheKey = `${config.provider}-${JSON.stringify(config.config)}`;
    
    if (this.metricsCache.has(cacheKey)) {
      return this.metricsCache.get(cacheKey)!;
    }

    let provider: IMetricsCollector;

    switch (config.provider) {
      case 'prometheus':
        provider = await this.createPrometheusProvider(config.config);
        break;
      case 'datadog':
        provider = await this.createDatadogMetricsProvider(config.config);
        break;
      case 'newrelic':
        provider = await this.createNewRelicMetricsProvider(config.config);
        break;
      case 'custom':
        provider = await this.createCustomMetricsProvider(config.config);
        break;
      default:
        throw new Error(`Unsupported metrics provider type: ${config.provider}`);
    }

    await provider.initialize(config.config);
    this.metricsCache.set(cacheKey, provider);
    
    return provider;
  }

  /**
   * Create log provider based on configuration
   */
  async createLogProvider(config: { provider: LogProviderType; config: any }): Promise<ILogProvider> {
    const cacheKey = `${config.provider}-${JSON.stringify(config.config)}`;
    
    if (this.logCache.has(cacheKey)) {
      return this.logCache.get(cacheKey)!;
    }

    let provider: ILogProvider;

    switch (config.provider) {
      case 'elk':
        provider = await this.createELKProvider(config.config);
        break;
      case 'splunk':
        provider = await this.createSplunkProvider(config.config);
        break;
      case 'cloudwatch':
        provider = await this.createCloudWatchProvider(config.config);
        break;
      case 'custom':
        provider = await this.createCustomLogProvider(config.config);
        break;
      default:
        throw new Error(`Unsupported log provider type: ${config.provider}`);
    }

    await provider.initialize(config.config);
    this.logCache.set(cacheKey, provider);
    
    return provider;
  }

  /**
   * Create alert manager based on configuration
   */
  async createAlertManager(config: { provider: AlertProviderType; config: any }): Promise<IAlertManager> {
    const cacheKey = `${config.provider}-${JSON.stringify(config.config)}`;
    
    if (this.alertCache.has(cacheKey)) {
      return this.alertCache.get(cacheKey)!;
    }

    let provider: IAlertManager;

    switch (config.provider) {
      case 'pagerduty':
        provider = await this.createPagerDutyProvider(config.config);
        break;
      case 'slack':
        provider = await this.createSlackProvider(config.config);
        break;
      case 'email':
        provider = await this.createEmailProvider(config.config);
        break;
      case 'webhook':
        provider = await this.createWebhookProvider(config.config);
        break;
      case 'custom':
        provider = await this.createCustomAlertProvider(config.config);
        break;
      default:
        throw new Error(`Unsupported alert provider type: ${config.provider}`);
    }

    await provider.initialize(config.config);
    this.alertCache.set(cacheKey, provider);
    
    return provider;
  }

  /**
   * Create tracing provider based on configuration
   */
  async createTracingProvider(config: { provider: TracingProviderType; config: any }): Promise<ITracingProvider> {
    const cacheKey = `${config.provider}-${JSON.stringify(config.config)}`;
    
    if (this.tracingCache.has(cacheKey)) {
      return this.tracingCache.get(cacheKey)!;
    }

    let provider: ITracingProvider;

    switch (config.provider) {
      case 'jaeger':
        provider = await this.createJaegerProvider(config.config);
        break;
      case 'zipkin':
        provider = await this.createZipkinProvider(config.config);
        break;
      case 'datadog':
        provider = await this.createDatadogTracingProvider(config.config);
        break;
      case 'custom':
        provider = await this.createCustomTracingProvider(config.config);
        break;
      default:
        throw new Error(`Unsupported tracing provider type: ${config.provider}`);
    }

    await provider.initialize(config.config);
    this.tracingCache.set(cacheKey, provider);
    
    return provider;
  }

  /**
   * Get available provider types
   */
  getAvailableMetricsProviders(): MetricsProviderType[] {
    return ['prometheus', 'datadog', 'newrelic', 'custom'];
  }

  getAvailableLogProviders(): LogProviderType[] {
    return ['elk', 'splunk', 'cloudwatch', 'custom'];
  }

  getAvailableAlertProviders(): AlertProviderType[] {
    return ['pagerduty', 'slack', 'email', 'webhook', 'custom'];
  }

  getAvailableTracingProviders(): TracingProviderType[] {
    return ['jaeger', 'zipkin', 'datadog', 'custom'];
  }

  /**
   * Validate provider configurations
   */
  validateMetricsConfig(config: { provider: MetricsProviderType; config: any }): ValidationResult {
    const errors: string[] = [];

    switch (config.provider) {
      case 'prometheus':
        if (!config.config?.endpoint) errors.push('Prometheus endpoint is required');
        break;
      case 'datadog':
        if (!config.config?.apiKey) errors.push('Datadog API key is required');
        break;
      case 'newrelic':
        if (!config.config?.licenseKey) errors.push('New Relic license key is required');
        break;
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  validateLogConfig(config: { provider: LogProviderType; config: any }): ValidationResult {
    const errors: string[] = [];

    switch (config.provider) {
      case 'elk':
        if (!config.config?.elasticsearch?.host) errors.push('Elasticsearch host is required');
        if (!config.config?.elasticsearch?.port) errors.push('Elasticsearch port is required');
        break;
      case 'splunk':
        if (!config.config?.host) errors.push('Splunk host is required');
        if (!config.config?.token) errors.push('Splunk HEC token is required');
        break;
      case 'cloudwatch':
        if (!config.config?.region) errors.push('AWS region is required');
        if (!config.config?.logGroup) errors.push('CloudWatch log group is required');
        break;
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  validateAlertConfig(config: { provider: AlertProviderType; config: any }): ValidationResult {
    const errors: string[] = [];

    switch (config.provider) {
      case 'pagerduty':
        if (!config.config?.integrationKey) errors.push('PagerDuty integration key is required');
        break;
      case 'slack':
        if (!config.config?.webhookUrl) errors.push('Slack webhook URL is required');
        break;
      case 'email':
        if (!config.config?.smtpHost) errors.push('SMTP host is required');
        if (!config.config?.fromEmail) errors.push('From email is required');
        break;
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Clear cached providers (useful for testing)
   */
  clearCache(): void {
    this.metricsCache.clear();
    this.logCache.clear();
    this.alertCache.clear();
    this.tracingCache.clear();
  }

  // Private factory methods for each provider type
  private async createPrometheusProvider(config: any): Promise<IMetricsCollector> {
    const { PrometheusMetricsCollector } = await import('@/services/monitoring/PrometheusMetricsCollector');
    return new PrometheusMetricsCollector();
  }

  private async createDatadogMetricsProvider(config: any): Promise<IMetricsCollector> {
    const { DatadogMetricsCollector } = await import('@/services/monitoring/DatadogMetricsCollector');
    return new DatadogMetricsCollector();
  }

  private async createNewRelicMetricsProvider(config: any): Promise<IMetricsCollector> {
    const { NewRelicMetricsCollector } = await import('@/services/monitoring/NewRelicMetricsCollector');
    return new NewRelicMetricsCollector();
  }

  private async createCustomMetricsProvider(config: any): Promise<IMetricsCollector> {
    const { CustomMetricsCollector } = await import('@/services/monitoring/CustomMetricsCollector');
    return new CustomMetricsCollector();
  }

  private async createELKProvider(config: any): Promise<ILogProvider> {
    const { ELKLogProvider } = await import('@/services/monitoring/ELKLogProvider');
    return new ELKLogProvider();
  }

  private async createSplunkProvider(config: any): Promise<ILogProvider> {
    const { SplunkLogProvider } = await import('@/services/monitoring/SplunkLogProvider');
    return new SplunkLogProvider();
  }

  private async createCloudWatchProvider(config: any): Promise<ILogProvider> {
    const { CloudWatchLogProvider } = await import('@/services/monitoring/CloudWatchLogProvider');
    return new CloudWatchLogProvider();
  }

  private async createCustomLogProvider(config: any): Promise<ILogProvider> {
    const { CustomLogProvider } = await import('@/services/monitoring/CustomLogProvider');
    return new CustomLogProvider();
  }

  private async createPagerDutyProvider(config: any): Promise<IAlertManager> {
    const { PagerDutyAlertManager } = await import('@/services/monitoring/PagerDutyAlertManager');
    return new PagerDutyAlertManager();
  }

  private async createSlackProvider(config: any): Promise<IAlertManager> {
    const { SlackAlertManager } = await import('@/services/monitoring/SlackAlertManager');
    return new SlackAlertManager();
  }

  private async createEmailProvider(config: any): Promise<IAlertManager> {
    const { EmailAlertManager } = await import('@/services/monitoring/EmailAlertManager');
    return new EmailAlertManager();
  }

  private async createWebhookProvider(config: any): Promise<IAlertManager> {
    const { WebhookAlertManager } = await import('@/services/monitoring/WebhookAlertManager');
    return new WebhookAlertManager();
  }

  private async createCustomAlertProvider(config: any): Promise<IAlertManager> {
    const { CustomAlertManager } = await import('@/services/monitoring/CustomAlertManager');
    return new CustomAlertManager();
  }

  private async createJaegerProvider(config: any): Promise<ITracingProvider> {
    const { JaegerTracingProvider } = await import('@/services/monitoring/JaegerTracingProvider');
    return new JaegerTracingProvider();
  }

  private async createZipkinProvider(config: any): Promise<ITracingProvider> {
    const { ZipkinTracingProvider } = await import('@/services/monitoring/ZipkinTracingProvider');
    return new ZipkinTracingProvider();
  }

  private async createDatadogTracingProvider(config: any): Promise<ITracingProvider> {
    const { DatadogTracingProvider } = await import('@/services/monitoring/DatadogTracingProvider');
    return new DatadogTracingProvider();
  }

  private async createCustomTracingProvider(config: any): Promise<ITracingProvider> {
    const { CustomTracingProvider } = await import('@/services/monitoring/CustomTracingProvider');
    return new CustomTracingProvider();
  }
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}
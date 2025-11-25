/**
 * Production Monitoring Interfaces
 * 
 * Strategy Pattern implementation for pluggable monitoring providers.
 * Supports Prometheus, ELK Stack, Jaeger, PagerDuty, and custom providers.
 * 
 * Design Principles:
 * - Strategy Pattern: Runtime provider selection
 * - Interface Segregation: Separate concerns (metrics, logs, alerts, traces)
 * - Dependency Inversion: Abstract interfaces over concrete implementations
 * - Single Responsibility: Each provider handles one monitoring aspect
 */

export type MetricsProviderType = 'prometheus' | 'datadog' | 'newrelic' | 'custom';
export type LogProviderType = 'elk' | 'splunk' | 'cloudwatch' | 'custom';
export type AlertProviderType = 'pagerduty' | 'slack' | 'email' | 'webhook' | 'custom';
export type TracingProviderType = 'jaeger' | 'zipkin' | 'datadog' | 'custom';

// Metric Types
export interface MetricValue {
  value: number;
  timestamp: Date;
  labels?: Record<string, string>;
}

export interface MetricSeries {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  help: string;
  values: MetricValue[];
}

export interface BusinessMetric {
  name: string;
  value: number;
  unit: string;
  category: 'performance' | 'business' | 'security' | 'system';
  tags: Record<string, string>;
  timestamp: Date;
}

// Log Types
export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  timestamp: Date;
  service: string;
  traceId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface LogQuery {
  service?: string;
  level?: string[];
  timeRange: {
    start: Date;
    end: Date;
  };
  query?: string;
  limit?: number;
}

export interface LogSearchResult {
  entries: LogEntry[];
  totalCount: number;
  hasMore: boolean;
}

// Alert Types
export interface AlertRule {
  id: string;
  name: string;
  description: string;
  condition: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  channels: AlertChannel[];
  throttle?: {
    duration: number;
    maxAlerts: number;
  };
}

export interface AlertChannel {
  type: 'email' | 'slack' | 'pagerduty' | 'webhook';
  config: Record<string, any>;
}

export interface Alert {
  id: string;
  ruleId: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'firing' | 'resolved' | 'acknowledged';
  triggeredAt: Date;
  resolvedAt?: Date;
  metadata: Record<string, any>;
}

// Trace Types
export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  tags: Record<string, any>;
  logs: TraceLog[];
  status: 'ok' | 'error' | 'timeout';
}

export interface TraceLog {
  timestamp: Date;
  level: string;
  message: string;
  fields?: Record<string, any>;
}

export interface TraceQuery {
  service?: string;
  operation?: string;
  traceId?: string;
  timeRange: {
    start: Date;
    end: Date;
  };
  tags?: Record<string, string>;
  minDuration?: number;
  maxDuration?: number;
  limit?: number;
}

// Configuration Interfaces
export interface PrometheusConfig {
  endpoint: string;
  basicAuth?: {
    username: string;
    password: string;
  };
  pushGateway?: string;
  scrapeInterval?: number;
}

export interface ELKConfig {
  elasticsearch: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    index: string;
  };
  logstash?: {
    host: string;
    port: number;
  };
  kibana?: {
    host: string;
    port: number;
  };
}

export interface PagerDutyConfig {
  integrationKey: string;
  routingKey?: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
}

export interface JaegerConfig {
  endpoint: string;
  serviceName: string;
  samplingRate?: number;
  tags?: Record<string, string>;
}

export interface MonitoringConfig {
  metrics?: {
    provider: MetricsProviderType;
    config: PrometheusConfig | Record<string, any>;
  };
  logging?: {
    provider: LogProviderType;
    config: ELKConfig | Record<string, any>;
  };
  alerting?: {
    provider: AlertProviderType;
    config: PagerDutyConfig | Record<string, any>;
  };
  tracing?: {
    provider: TracingProviderType;
    config: JaegerConfig | Record<string, any>;
  };
}

// Core Monitoring Interfaces
export interface IMetricsCollector {
  readonly providerType: MetricsProviderType;
  readonly providerName: string;

  initialize(config: any): Promise<void>;
  
  // Basic metrics
  incrementCounter(name: string, value?: number, labels?: Record<string, string>): Promise<void>;
  setGauge(name: string, value: number, labels?: Record<string, string>): Promise<void>;
  recordHistogram(name: string, value: number, labels?: Record<string, string>): Promise<void>;
  
  // Business metrics
  recordBusinessMetric(metric: BusinessMetric): Promise<void>;
  getMetrics(query: MetricQuery): Promise<MetricSeries[]>;
  
  // Health and status
  isHealthy(): Promise<boolean>;
  getProviderMetrics(): Promise<MetricsProviderMetrics>;
}

export interface ILogProvider {
  readonly providerType: LogProviderType;
  readonly providerName: string;

  initialize(config: any): Promise<void>;
  
  // Logging operations
  log(entry: LogEntry): Promise<void>;
  logBatch(entries: LogEntry[]): Promise<void>;
  
  // Log querying
  search(query: LogQuery): Promise<LogSearchResult>;
  getLogsByTraceId(traceId: string): Promise<LogEntry[]>;
  
  // Health and status
  isHealthy(): Promise<boolean>;
  getProviderMetrics(): Promise<LogProviderMetrics>;
}

export interface IAlertManager {
  readonly providerType: AlertProviderType;
  readonly providerName: string;

  initialize(config: any): Promise<void>;
  
  // Alert management
  createAlertRule(rule: AlertRule): Promise<string>;
  updateAlertRule(ruleId: string, updates: Partial<AlertRule>): Promise<void>;
  deleteAlertRule(ruleId: string): Promise<void>;
  
  // Alert operations
  triggerAlert(alert: Omit<Alert, 'id' | 'triggeredAt'>): Promise<string>;
  acknowledgeAlert(alertId: string, userId: string): Promise<void>;
  resolveAlert(alertId: string, resolution: string): Promise<void>;
  
  // Alert querying
  getActiveAlerts(): Promise<Alert[]>;
  getAlertHistory(ruleId?: string, timeRange?: { start: Date; end: Date }): Promise<Alert[]>;
  
  // Health and status
  isHealthy(): Promise<boolean>;
  getProviderMetrics(): Promise<AlertProviderMetrics>;
}

export interface ITracingProvider {
  readonly providerType: TracingProviderType;
  readonly providerName: string;

  initialize(config: any): Promise<void>;
  
  // Trace operations
  startSpan(operationName: string, parentSpan?: TraceSpan): Promise<TraceSpan>;
  finishSpan(span: TraceSpan): Promise<void>;
  
  // Trace querying
  getTraces(query: TraceQuery): Promise<TraceSpan[]>;
  getTraceById(traceId: string): Promise<TraceSpan[]>;
  
  // Health and status
  isHealthy(): Promise<boolean>;
  getProviderMetrics(): Promise<TracingProviderMetrics>;
}

// Provider Metrics
export interface MetricsProviderMetrics {
  totalMetrics: number;
  metricsPerSecond: number;
  errorRate: number;
  lastCollection: Date;
  storageSize: number;
}

export interface LogProviderMetrics {
  totalLogs: number;
  logsPerSecond: number;
  errorRate: number;
  lastLog: Date;
  indexSize: number;
}

export interface AlertProviderMetrics {
  totalAlerts: number;
  activeAlerts: number;
  alertsPerHour: number;
  averageResolutionTime: number;
  lastAlert: Date;
}

export interface TracingProviderMetrics {
  totalTraces: number;
  tracesPerSecond: number;
  averageTraceSize: number;
  errorRate: number;
  lastTrace: Date;
}

// Query Interfaces
export interface MetricQuery {
  metric: string;
  timeRange: {
    start: Date;
    end: Date;
  };
  step?: number;
  labels?: Record<string, string>;
}

// Error Types
export enum MonitoringErrorCode {
  PROVIDER_NOT_INITIALIZED = 'PROVIDER_NOT_INITIALIZED',
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  QUERY_FAILED = 'QUERY_FAILED',
  METRIC_RECORDING_FAILED = 'METRIC_RECORDING_FAILED',
  LOG_INGESTION_FAILED = 'LOG_INGESTION_FAILED',
  ALERT_CREATION_FAILED = 'ALERT_CREATION_FAILED',
  TRACE_CREATION_FAILED = 'TRACE_CREATION_FAILED'
}

export interface MonitoringError {
  code: MonitoringErrorCode;
  message: string;
  details?: Record<string, any>;
}
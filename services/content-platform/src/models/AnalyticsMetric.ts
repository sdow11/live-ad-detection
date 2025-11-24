import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, BeforeInsert } from 'typeorm';

/**
 * Analytics Metric Entity
 * 
 * Stores individual analytics data points for various system activities
 * Supports flexible metadata storage for different metric types
 * 
 * Single Responsibility: Analytics data storage and management
 * Open/Closed: Extensible for new metric types via metadata
 * Liskov Substitution: Standard entity pattern
 * Interface Segregation: Focused on analytics concerns
 * Dependency Inversion: Uses standard ORM patterns
 */

@Entity('analytics_metrics')
export class AnalyticsMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  type: string;

  @Column({ name: 'resource_id', length: 255 })
  resourceId: string;

  @Column({ name: 'user_id', length: 255, nullable: true })
  userId: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6 })
  value: number;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  timestamp: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @BeforeInsert()
  setTimestamp(): void {
    if (!this.timestamp) {
      this.timestamp = new Date();
    }
  }

  /**
   * Get metric value as number
   */
  getNumericValue(): number {
    return typeof this.value === 'string' ? parseFloat(this.value) : this.value;
  }

  /**
   * Get metadata value by key
   */
  getMetadataValue(key: string): any {
    return this.metadata ? this.metadata[key] : undefined;
  }

  /**
   * Set metadata value by key
   */
  setMetadataValue(key: string, value: any): void {
    if (!this.metadata) {
      this.metadata = {};
    }
    this.metadata[key] = value;
  }

  /**
   * Check if metric is of specific type
   */
  isType(type: string): boolean {
    return this.type === type;
  }

  /**
   * Check if metric is recent (within specified minutes)
   */
  isRecent(minutes: number = 60): boolean {
    const now = new Date();
    const diffMs = now.getTime() - this.timestamp.getTime();
    const diffMinutes = diffMs / (1000 * 60);
    return diffMinutes <= minutes;
  }

  /**
   * Get age of metric in minutes
   */
  getAgeInMinutes(): number {
    const now = new Date();
    const diffMs = now.getTime() - this.timestamp.getTime();
    return Math.floor(diffMs / (1000 * 60));
  }

  /**
   * Format timestamp for display
   */
  getFormattedTimestamp(format: 'date' | 'datetime' | 'time' = 'datetime'): string {
    const options: Intl.DateTimeFormatOptions = {};
    
    switch (format) {
      case 'date':
        options.year = 'numeric';
        options.month = '2-digit';
        options.day = '2-digit';
        break;
      case 'time':
        options.hour = '2-digit';
        options.minute = '2-digit';
        options.second = '2-digit';
        break;
      case 'datetime':
      default:
        options.year = 'numeric';
        options.month = '2-digit';
        options.day = '2-digit';
        options.hour = '2-digit';
        options.minute = '2-digit';
        options.second = '2-digit';
        break;
    }

    return this.timestamp.toLocaleDateString('en-US', options);
  }

  /**
   * Convert to safe JSON (for API responses)
   */
  toSafeJSON(): {
    id: string;
    type: string;
    resourceId: string;
    userId: string | null;
    value: number;
    metadata: Record<string, any> | null;
    timestamp: Date;
    createdAt: Date;
    updatedAt: Date;
  } {
    return {
      id: this.id,
      type: this.type,
      resourceId: this.resourceId,
      userId: this.userId,
      value: this.getNumericValue(),
      metadata: this.metadata,
      timestamp: this.timestamp,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Validate metric data
   */
  static validateMetricData(data: {
    type: string;
    resourceId: string;
    value: number;
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.type || data.type.trim().length === 0) {
      errors.push('Metric type is required');
    }

    if (data.type && data.type.length > 100) {
      errors.push('Metric type must be 100 characters or less');
    }

    if (!data.resourceId || data.resourceId.trim().length === 0) {
      errors.push('Resource ID is required');
    }

    if (data.resourceId && data.resourceId.length > 255) {
      errors.push('Resource ID must be 255 characters or less');
    }

    if (typeof data.value !== 'number' || isNaN(data.value)) {
      errors.push('Value must be a valid number');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get common metric types
   */
  static getMetricTypes(): { [key: string]: string } {
    return {
      CONTENT_UPLOAD: 'content_upload',
      CONTENT_VIEW: 'content_view',
      CONTENT_DOWNLOAD: 'content_download',
      AD_DETECTION: 'ad_detection',
      PIP_SESSION: 'pip_session',
      SCHEDULE_EXECUTION: 'schedule_execution',
      USER_LOGIN: 'user_login',
      SYSTEM_ERROR: 'system_error',
      API_REQUEST: 'api_request',
      PERFORMANCE: 'performance'
    };
  }

  /**
   * Create metric from data
   */
  static create(data: {
    type: string;
    resourceId: string;
    userId?: string;
    value: number;
    metadata?: Record<string, any>;
    timestamp?: Date;
  }): AnalyticsMetric {
    const metric = new AnalyticsMetric();
    metric.type = data.type;
    metric.resourceId = data.resourceId;
    metric.userId = data.userId || null;
    metric.value = data.value;
    metric.metadata = data.metadata || null;
    metric.timestamp = data.timestamp || new Date();
    
    return metric;
  }
}
/**
 * Analytics Service Interface
 * 
 * Defines the contract for analytics data collection, processing, and reporting
 * Supports content performance, ad detection, PiP usage, and system metrics
 */

export interface AnalyticsMetric {
  id: string;
  type: string;
  resourceId: string;
  userId?: string;
  value: number;
  metadata?: Record<string, any>;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalyticsQuery {
  type: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  filters?: Record<string, any>;
  groupBy?: string;
  orderBy?: string;
  limit?: number;
}

export interface AnalyticsResult {
  type: string;
  data: any;
  generatedAt: Date;
  metadata?: Record<string, any>;
}

export interface AnalyticsReport {
  id: string;
  type: string;
  title: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  sections: AnalyticsResult[];
  generatedAt: Date;
  generatedBy: string;
  metadata?: Record<string, any>;
}

export interface ContentPerformanceMetric {
  contentId: string;
  title: string;
  views: number;
  totalViewTime: number;
  averageViewTime: number;
  uploadDate: Date;
}

export interface AdDetectionMetric {
  date: string;
  adType: string;
  count: number;
  avgConfidence: number;
}

export interface PiPUsageMetric {
  date: string;
  sessionCount: number;
  totalDuration: number;
  avgDuration: number;
  uniqueUsers: number;
}

export interface SystemOverviewData {
  totalContent: number;
  totalSchedules: number;
  activeSchedules: number;
  totalPiPSessions: number;
}

export interface RealTimeDashboard {
  totalContent: number;
  recentActivity: Array<{
    type: string;
    count: string;
    timeframe: string;
  }>;
  lastUpdated: Date;
}

export interface TrendingContent {
  contentId: string;
  title: string;
  viewsToday: number;
  viewsYesterday: number;
  trendScore: number;
}

export interface IAnalyticsService {
  /**
   * Track content upload metric
   */
  trackContentUpload(contentId: string, userId: string, metadata?: Record<string, any>): Promise<void>;

  /**
   * Track content view metric
   */
  trackContentView(contentId: string, userId: string, viewDuration: number): Promise<void>;

  /**
   * Track ad detection metric
   */
  trackAdDetection(streamId: string, adType: string, confidence: number, metadata?: Record<string, any>): Promise<void>;

  /**
   * Track PiP session metric
   */
  trackPiPSession(sessionId: string, contentId: string, userId: string, duration: number): Promise<void>;

  /**
   * Get content performance analytics
   */
  getContentPerformance(query: AnalyticsQuery): Promise<AnalyticsResult>;

  /**
   * Get ad detection analytics
   */
  getAdDetectionAnalytics(query: AnalyticsQuery): Promise<AnalyticsResult>;

  /**
   * Get PiP usage analytics
   */
  getPiPUsageAnalytics(query: AnalyticsQuery): Promise<AnalyticsResult>;

  /**
   * Get system overview analytics
   */
  getSystemOverview(): Promise<AnalyticsResult>;

  /**
   * Generate comprehensive analytics report
   */
  generateReport(query: AnalyticsQuery): Promise<AnalyticsReport>;

  /**
   * Export report in specified format
   */
  exportReport(report: AnalyticsReport, format: 'csv' | 'json' | 'pdf'): Promise<string>;

  /**
   * Get real-time dashboard data
   */
  getRealTimeDashboard(): Promise<RealTimeDashboard>;

  /**
   * Get trending content
   */
  getTrendingContent(limit?: number): Promise<TrendingContent[]>;

  /**
   * Save custom metric
   */
  saveMetric(metric: Omit<AnalyticsMetric, 'id' | 'timestamp' | 'createdAt' | 'updatedAt'>): Promise<AnalyticsMetric>;

  /**
   * Query custom metrics
   */
  queryMetrics(query: AnalyticsQuery): Promise<AnalyticsResult>;

  /**
   * Get analytics statistics
   */
  getAnalyticsStats(): Promise<{
    totalMetrics: number;
    metricsToday: number;
    topMetricTypes: Array<{ type: string; count: number }>;
  }>;
}
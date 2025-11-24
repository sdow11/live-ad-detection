import { Repository } from 'typeorm';
import { IAnalyticsService, AnalyticsMetric as IAnalyticsMetric, AnalyticsQuery, AnalyticsResult, AnalyticsReport, ContentPerformanceMetric, AdDetectionMetric, PiPUsageMetric, SystemOverviewData, RealTimeDashboard, TrendingContent } from '@/interfaces/IAnalyticsService';
import { AnalyticsMetric } from '@/models/AnalyticsMetric';
import { Content } from '@/models/Content';
import { Schedule } from '@/models/Schedule';
import { Logger } from '@/utils/Logger';
import { ValidationError } from '@/utils/errors';
import crypto from 'crypto';

/**
 * Analytics Service Implementation
 * 
 * Handles analytics data collection, processing, and reporting
 * Implements comprehensive analytics for content, ad detection, and PiP usage
 * 
 * Single Responsibility: Analytics operations and reporting
 * Open/Closed: Extensible for new analytics types
 * Liskov Substitution: Implements IAnalyticsService interface
 * Interface Segregation: Focused on analytics concerns
 * Dependency Inversion: Uses injected repositories
 */

export class AnalyticsService implements IAnalyticsService {
  private logger: Logger;

  constructor(
    private metricRepository: Repository<AnalyticsMetric>,
    private contentRepository: Repository<Content>,
    private scheduleRepository: Repository<Schedule>,
    private pipSessionRepository: Repository<any> // PiP session model to be created
  ) {
    this.logger = new Logger('AnalyticsService');
  }

  /**
   * Track content upload metric
   */
  async trackContentUpload(contentId: string, userId: string, metadata?: Record<string, any>): Promise<void> {
    try {
      if (!contentId || contentId.trim().length === 0) {
        throw new ValidationError('Content ID is required');
      }

      if (!userId || userId.trim().length === 0) {
        throw new ValidationError('User ID is required');
      }

      const metric = AnalyticsMetric.create({
        type: AnalyticsMetric.getMetricTypes().CONTENT_UPLOAD,
        resourceId: contentId,
        userId,
        value: 1,
        metadata: {
          uploadTimestamp: new Date().toISOString(),
          ...metadata
        }
      });

      await this.metricRepository.save(metric);
      this.logger.info(`Content upload tracked: ${contentId} by user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to track content upload:', error);
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new Error('Failed to track content upload metric');
    }
  }

  /**
   * Track content view metric
   */
  async trackContentView(contentId: string, userId: string, viewDuration: number): Promise<void> {
    try {
      if (!contentId || contentId.trim().length === 0) {
        throw new ValidationError('Content ID is required');
      }

      if (!userId || userId.trim().length === 0) {
        throw new ValidationError('User ID is required');
      }

      const metric = AnalyticsMetric.create({
        type: AnalyticsMetric.getMetricTypes().CONTENT_VIEW,
        resourceId: contentId,
        userId,
        value: viewDuration,
        metadata: {
          viewTimestamp: new Date().toISOString()
        }
      });

      await this.metricRepository.save(metric);
      this.logger.debug(`Content view tracked: ${contentId} by user ${userId}, duration: ${viewDuration}s`);
    } catch (error) {
      this.logger.error('Failed to track content view:', error);
      throw new Error('Failed to track content view metric');
    }
  }

  /**
   * Track ad detection metric
   */
  async trackAdDetection(streamId: string, adType: string, confidence: number, metadata?: Record<string, any>): Promise<void> {
    try {
      if (!streamId || streamId.trim().length === 0) {
        throw new ValidationError('Stream ID is required');
      }

      const metric = AnalyticsMetric.create({
        type: AnalyticsMetric.getMetricTypes().AD_DETECTION,
        resourceId: streamId,
        value: confidence,
        metadata: {
          adType,
          detectionTimestamp: new Date().toISOString(),
          ...metadata
        }
      });

      await this.metricRepository.save(metric);
      this.logger.info(`Ad detection tracked: ${adType} on ${streamId}, confidence: ${confidence}`);
    } catch (error) {
      this.logger.error('Failed to track ad detection:', error);
      throw new Error('Failed to track ad detection metric');
    }
  }

  /**
   * Track PiP session metric
   */
  async trackPiPSession(sessionId: string, contentId: string, userId: string, duration: number): Promise<void> {
    try {
      if (!sessionId || sessionId.trim().length === 0) {
        throw new ValidationError('Session ID is required');
      }

      const metric = AnalyticsMetric.create({
        type: AnalyticsMetric.getMetricTypes().PIP_SESSION,
        resourceId: sessionId,
        userId,
        value: duration,
        metadata: {
          contentId,
          sessionTimestamp: new Date().toISOString()
        }
      });

      await this.metricRepository.save(metric);
      this.logger.info(`PiP session tracked: ${sessionId}, duration: ${duration}s`);
    } catch (error) {
      this.logger.error('Failed to track PiP session:', error);
      throw new Error('Failed to track PiP session metric');
    }
  }

  /**
   * Get content performance analytics
   */
  async getContentPerformance(query: AnalyticsQuery): Promise<AnalyticsResult> {
    try {
      this.validateDateRange(query);

      const queryBuilder = this.contentRepository.createQueryBuilder('content')
        .select([
          'content.id as contentId',
          'content.title as title',
          'COUNT(views.id) as views',
          'COALESCE(SUM(views.value), 0) as totalViewTime',
          'COALESCE(AVG(views.value), 0) as averageViewTime',
          'content.createdAt as uploadDate'
        ])
        .leftJoin(
          this.metricRepository.createQueryBuilder().subQuery()
            .select()
            .from(AnalyticsMetric, 'metric')
            .where("metric.type = 'content_view'")
            .getQuery(),
          'views',
          'views.resourceId = content.id'
        );

      if (query.dateRange) {
        queryBuilder
          .andWhere('content.createdAt >= :startDate', { startDate: query.dateRange.start })
          .andWhere('content.createdAt <= :endDate', { endDate: query.dateRange.end });
      }

      queryBuilder
        .groupBy('content.id, content.title, content.createdAt')
        .orderBy('views', 'DESC');

      if (query.limit) {
        queryBuilder.limit(query.limit);
      }

      const results = await queryBuilder.getRawMany();

      const data: ContentPerformanceMetric[] = results.map(item => ({
        contentId: item.contentId,
        title: item.title,
        views: parseInt(item.views) || 0,
        totalViewTime: parseInt(item.totalViewTime) || 0,
        averageViewTime: parseFloat(item.averageViewTime) || 0,
        uploadDate: item.uploadDate
      }));

      return {
        type: 'content_performance',
        data,
        generatedAt: new Date()
      };
    } catch (error) {
      this.logger.error('Failed to get content performance:', error);
      throw error;
    }
  }

  /**
   * Get ad detection analytics
   */
  async getAdDetectionAnalytics(query: AnalyticsQuery): Promise<AnalyticsResult> {
    try {
      this.validateDateRange(query);

      const queryBuilder = this.metricRepository.createQueryBuilder('metric')
        .select([
          'DATE(metric.timestamp) as date',
          "JSON_UNQUOTE(JSON_EXTRACT(metric.metadata, '$.adType')) as adType",
          'COUNT(*) as count',
          'AVG(metric.value) as avgConfidence'
        ])
        .where("metric.type = 'ad_detection'");

      if (query.dateRange) {
        queryBuilder
          .andWhere('metric.timestamp >= :startDate', { startDate: query.dateRange.start })
          .andWhere('metric.timestamp <= :endDate', { endDate: query.dateRange.end });
      }

      queryBuilder
        .groupBy('DATE(metric.timestamp), JSON_UNQUOTE(JSON_EXTRACT(metric.metadata, \'$.adType\'))')
        .orderBy('date', 'DESC')
        .addOrderBy('adType', 'ASC');

      const results = await queryBuilder.getRawMany();

      const data: AdDetectionMetric[] = results.map(item => ({
        date: item.date,
        adType: item.adType || 'unknown',
        count: parseInt(item.count),
        avgConfidence: parseFloat(item.avgConfidence)
      }));

      return {
        type: 'ad_detection',
        data,
        generatedAt: new Date()
      };
    } catch (error) {
      this.logger.error('Failed to get ad detection analytics:', error);
      throw error;
    }
  }

  /**
   * Get PiP usage analytics
   */
  async getPiPUsageAnalytics(query: AnalyticsQuery): Promise<AnalyticsResult> {
    try {
      this.validateDateRange(query);

      const queryBuilder = this.metricRepository.createQueryBuilder('metric')
        .select([
          'DATE(metric.timestamp) as date',
          'COUNT(*) as sessionCount',
          'SUM(metric.value) as totalDuration',
          'AVG(metric.value) as avgDuration',
          'COUNT(DISTINCT metric.userId) as uniqueUsers'
        ])
        .where("metric.type = 'pip_session'");

      if (query.dateRange) {
        queryBuilder
          .andWhere('metric.timestamp >= :startDate', { startDate: query.dateRange.start })
          .andWhere('metric.timestamp <= :endDate', { endDate: query.dateRange.end });
      }

      queryBuilder
        .groupBy('DATE(metric.timestamp)')
        .orderBy('date', 'DESC');

      const results = await queryBuilder.getRawMany();

      const data: PiPUsageMetric[] = results.map(item => ({
        date: item.date,
        sessionCount: parseInt(item.sessionCount),
        totalDuration: parseInt(item.totalDuration),
        avgDuration: parseFloat(item.avgDuration),
        uniqueUsers: parseInt(item.uniqueUsers)
      }));

      return {
        type: 'pip_usage',
        data,
        generatedAt: new Date()
      };
    } catch (error) {
      this.logger.error('Failed to get PiP usage analytics:', error);
      throw error;
    }
  }

  /**
   * Get system overview analytics
   */
  async getSystemOverview(): Promise<AnalyticsResult> {
    try {
      const [
        totalContent,
        totalSchedules,
        activeSchedules,
        totalPiPSessions
      ] = await Promise.all([
        this.contentRepository.count(),
        this.scheduleRepository.count(),
        this.scheduleRepository.find({ where: { isActive: true } }),
        this.metricRepository.count({ where: { type: AnalyticsMetric.getMetricTypes().PIP_SESSION } })
      ]);

      const data: SystemOverviewData = {
        totalContent,
        totalSchedules,
        activeSchedules: activeSchedules.length,
        totalPiPSessions
      };

      return {
        type: 'system_overview',
        data,
        generatedAt: new Date()
      };
    } catch (error) {
      this.logger.error('Failed to get system overview:', error);
      throw error;
    }
  }

  /**
   * Generate comprehensive analytics report
   */
  async generateReport(query: AnalyticsQuery): Promise<AnalyticsReport> {
    try {
      const reportId = crypto.randomUUID();
      const sections: AnalyticsResult[] = [];

      if (query.type === 'comprehensive') {
        // Get all analytics sections
        const [
          contentPerformance,
          adDetection,
          pipUsage,
          systemOverview
        ] = await Promise.all([
          this.getContentPerformance(query),
          this.getAdDetectionAnalytics(query),
          this.getPiPUsageAnalytics(query),
          this.getSystemOverview()
        ]);

        sections.push(contentPerformance, adDetection, pipUsage, systemOverview);
      } else {
        // Generate specific report type
        switch (query.type) {
          case 'content_performance':
            sections.push(await this.getContentPerformance(query));
            break;
          case 'ad_detection':
            sections.push(await this.getAdDetectionAnalytics(query));
            break;
          case 'pip_usage':
            sections.push(await this.getPiPUsageAnalytics(query));
            break;
          default:
            throw new ValidationError(`Unsupported report type: ${query.type}`);
        }
      }

      const report: AnalyticsReport = {
        id: reportId,
        type: query.type,
        title: this.getReportTitle(query.type),
        dateRange: query.dateRange,
        sections,
        generatedAt: new Date(),
        generatedBy: 'system'
      };

      this.logger.info(`Analytics report generated: ${reportId}, type: ${query.type}`);
      return report;
    } catch (error) {
      this.logger.error('Failed to generate report:', error);
      throw error;
    }
  }

  /**
   * Export report in specified format
   */
  async exportReport(report: AnalyticsReport, format: 'csv' | 'json' | 'pdf'): Promise<string> {
    try {
      switch (format) {
        case 'csv':
          return this.exportReportAsCSV(report);
        case 'json':
          return this.exportReportAsJSON(report);
        case 'pdf':
          return this.exportReportAsPDF(report);
        default:
          throw new ValidationError(`Unsupported export format: ${format}`);
      }
    } catch (error) {
      this.logger.error('Failed to export report:', error);
      throw error;
    }
  }

  /**
   * Get real-time dashboard data
   */
  async getRealTimeDashboard(): Promise<RealTimeDashboard> {
    try {
      const totalContent = await this.contentRepository.count();

      const recentActivity = await this.metricRepository.createQueryBuilder('metric')
        .select([
          'metric.type as type',
          'COUNT(*) as count',
          "'last_hour' as timeframe"
        ])
        .where('metric.timestamp >= :oneHourAgo', { 
          oneHourAgo: new Date(Date.now() - 60 * 60 * 1000) 
        })
        .groupBy('metric.type')
        .getRawMany();

      return {
        totalContent,
        recentActivity,
        lastUpdated: new Date()
      };
    } catch (error) {
      this.logger.error('Failed to get real-time dashboard:', error);
      throw error;
    }
  }

  /**
   * Get trending content
   */
  async getTrendingContent(limit: number = 10): Promise<TrendingContent[]> {
    try {
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

      const queryBuilder = this.contentRepository.createQueryBuilder('content')
        .select([
          'content.id as contentId',
          'content.title as title',
          'COALESCE(today_views.view_count, 0) as viewsToday',
          'COALESCE(yesterday_views.view_count, 0) as viewsYesterday',
          'CASE WHEN COALESCE(yesterday_views.view_count, 0) = 0 THEN COALESCE(today_views.view_count, 0) * 100 ELSE ((COALESCE(today_views.view_count, 0) - COALESCE(yesterday_views.view_count, 0)) / COALESCE(yesterday_views.view_count, 0)) * 100 END as trendScore'
        ])
        .leftJoin(
          this.metricRepository.createQueryBuilder().subQuery()
            .select(['resourceId', 'COUNT(*) as view_count'])
            .from(AnalyticsMetric, 'metric')
            .where("metric.type = 'content_view'")
            .andWhere('DATE(metric.timestamp) = CURDATE()')
            .groupBy('resourceId')
            .getQuery(),
          'today_views',
          'today_views.resourceId = content.id'
        )
        .leftJoin(
          this.metricRepository.createQueryBuilder().subQuery()
            .select(['resourceId', 'COUNT(*) as view_count'])
            .from(AnalyticsMetric, 'metric')
            .where("metric.type = 'content_view'")
            .andWhere('DATE(metric.timestamp) = CURDATE() - INTERVAL 1 DAY')
            .groupBy('resourceId')
            .getQuery(),
          'yesterday_views',
          'yesterday_views.resourceId = content.id'
        )
        .orderBy('trendScore', 'DESC')
        .limit(limit);

      const results = await queryBuilder.getRawMany();

      return results.map(item => ({
        contentId: item.contentId,
        title: item.title,
        viewsToday: parseInt(item.viewsToday),
        viewsYesterday: parseInt(item.viewsYesterday),
        trendScore: parseFloat(item.trendScore)
      }));
    } catch (error) {
      this.logger.error('Failed to get trending content:', error);
      throw error;
    }
  }

  /**
   * Save custom metric
   */
  async saveMetric(metricData: Omit<IAnalyticsMetric, 'id' | 'timestamp' | 'createdAt' | 'updatedAt'>): Promise<IAnalyticsMetric> {
    try {
      const validation = AnalyticsMetric.validateMetricData(metricData);
      if (!validation.valid) {
        throw new ValidationError(`Invalid metric data: ${validation.errors.join(', ')}`);
      }

      const metric = AnalyticsMetric.create(metricData);
      const savedMetric = await this.metricRepository.save(metric);

      return savedMetric as IAnalyticsMetric;
    } catch (error) {
      this.logger.error('Failed to save metric:', error);
      throw error;
    }
  }

  /**
   * Query custom metrics
   */
  async queryMetrics(query: AnalyticsQuery): Promise<AnalyticsResult> {
    try {
      const queryBuilder = this.metricRepository.createQueryBuilder('metric');

      if (query.filters?.type) {
        queryBuilder.where('metric.type = :type', { type: query.filters.type });
      }

      if (query.dateRange) {
        queryBuilder
          .andWhere('metric.timestamp >= :startDate', { startDate: query.dateRange.start })
          .andWhere('metric.timestamp <= :endDate', { endDate: query.dateRange.end });
      }

      if (query.orderBy) {
        queryBuilder.orderBy(`metric.${query.orderBy}`, 'DESC');
      }

      if (query.limit) {
        queryBuilder.limit(query.limit);
      }

      const metrics = await queryBuilder.getMany();

      return {
        type: query.type || 'custom_query',
        data: metrics.map(m => m.toSafeJSON()),
        generatedAt: new Date()
      };
    } catch (error) {
      this.logger.error('Failed to query metrics:', error);
      throw error;
    }
  }

  /**
   * Get analytics statistics
   */
  async getAnalyticsStats(): Promise<{
    totalMetrics: number;
    metricsToday: number;
    topMetricTypes: Array<{ type: string; count: number }>;
  }> {
    try {
      const totalMetrics = await this.metricRepository.count();
      
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      const metricsToday = await this.metricRepository.count({
        where: {
          timestamp: { $gte: startOfDay } as any
        }
      });

      const topMetricTypes = await this.metricRepository.createQueryBuilder('metric')
        .select(['metric.type as type', 'COUNT(*) as count'])
        .groupBy('metric.type')
        .orderBy('count', 'DESC')
        .limit(10)
        .getRawMany();

      return {
        totalMetrics,
        metricsToday,
        topMetricTypes: topMetricTypes.map(item => ({
          type: item.type,
          count: parseInt(item.count)
        }))
      };
    } catch (error) {
      this.logger.error('Failed to get analytics stats:', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  private validateDateRange(query: AnalyticsQuery): void {
    if (query.dateRange && query.dateRange.start >= query.dateRange.end) {
      throw new ValidationError('Invalid date range: start date must be before end date');
    }
  }

  private getReportTitle(type: string): string {
    const titles = {
      comprehensive: 'Comprehensive Analytics Report',
      content_performance: 'Content Performance Report',
      ad_detection: 'Ad Detection Analytics Report',
      pip_usage: 'Picture-in-Picture Usage Report',
      system_overview: 'System Overview Report'
    };

    return titles[type as keyof typeof titles] || 'Analytics Report';
  }

  private exportReportAsCSV(report: AnalyticsReport): string {
    let csv = '';
    
    for (const section of report.sections) {
      if (section.data && section.data.length > 0) {
        // Add headers
        const headers = Object.keys(section.data[0]);
        csv += headers.join(',') + '\n';
        
        // Add data rows
        for (const row of section.data) {
          const values = headers.map(header => {
            const value = row[header];
            return typeof value === 'string' ? `"${value}"` : value;
          });
          csv += values.join(',') + '\n';
        }
        csv += '\n';
      }
    }

    return csv;
  }

  private exportReportAsJSON(report: AnalyticsReport): string {
    return JSON.stringify(report, null, 2);
  }

  private exportReportAsPDF(report: AnalyticsReport): string {
    // In a real implementation, you would use a PDF library like puppeteer or jsPDF
    // For now, return a simple text representation
    let content = `${report.title}\n`;
    content += `Generated: ${report.generatedAt.toISOString()}\n\n`;
    
    for (const section of report.sections) {
      content += `${section.type.toUpperCase()}\n`;
      content += `Data points: ${section.data.length}\n\n`;
    }

    return content;
  }
}
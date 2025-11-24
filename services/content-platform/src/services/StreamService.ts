import { Repository } from 'typeorm';
import { 
  IStreamService, 
  StreamConfiguration, 
  StreamMetadata, 
  StreamQuery, 
  StreamDiscovery, 
  StreamStats, 
  StreamStatus, 
  StreamRecording, 
  StreamEvent,
  StreamHealth,
  StreamState,
  StreamEventType
} from '@/interfaces/IStreamService';
import { Stream } from '@/models/Stream';
import { StreamRecording as StreamRecordingEntity } from '@/models/StreamRecording';
import { StreamEvent as StreamEventEntity } from '@/models/StreamEvent';
import { Logger } from '@/utils/Logger';
import { ValidationError } from '@/utils/errors';
import crypto from 'crypto';

/**
 * Stream Service Implementation
 * 
 * Handles live stream management, lifecycle operations, and real-time monitoring
 * Supports stream creation, discovery, recording, and analytics integration
 * 
 * Single Responsibility: Stream operations and management
 * Open/Closed: Extensible for new stream types and features
 * Liskov Substitution: Implements IStreamService interface
 * Interface Segregation: Focused on stream concerns
 * Dependency Inversion: Uses injected repositories and services
 */
export class StreamService implements IStreamService {
  private logger: Logger;

  constructor(
    private streamRepository: Repository<Stream>,
    private recordingRepository: Repository<StreamRecordingEntity>,
    private eventRepository: Repository<StreamEventEntity>,
    private analyticsService: any,
    private webSocketService: any
  ) {
    this.logger = new Logger('StreamService');
  }

  /**
   * Create a new stream with configuration
   */
  async createStream(config: Omit<StreamConfiguration, 'id'>, userId: string): Promise<StreamMetadata> {
    try {
      // Validate configuration
      const validation = Stream.validateConfiguration({
        title: config.title,
        resolution: config.quality.resolution,
        bitrate: config.quality.bitrate,
        framerate: config.quality.framerate,
        codec: config.quality.codec
      });

      if (!validation.valid) {
        throw new ValidationError(`Invalid stream configuration: ${validation.errors.join(', ')}`);
      }

      // Create stream entity
      const stream = this.streamRepository.create({
        title: config.title,
        description: config.description || null,
        userId,
        resolution: config.quality.resolution,
        bitrate: config.quality.bitrate,
        framerate: config.quality.framerate,
        codec: config.quality.codec,
        isPublic: config.isPublic,
        recordingEnabled: config.recordingEnabled,
        adDetectionEnabled: config.adDetectionEnabled,
        maxViewers: config.maxViewers || null,
        tags: config.tags || null,
        status: StreamState.IDLE,
        health: StreamHealth.GOOD,
        currentViewers: 0
      });

      const savedStream = await this.streamRepository.save(stream);
      this.logger.info(`Stream created: ${savedStream.id} by user ${userId}`);

      return this.mapStreamToMetadata(savedStream);
    } catch (error) {
      this.logger.error('Failed to create stream:', error);
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new Error('Failed to create stream');
    }
  }

  /**
   * Start a stream
   */
  async startStream(streamId: string, userId: string): Promise<void> {
    try {
      const stream = await this.findStreamByIdAndUser(streamId, userId);

      if (!stream.canStart()) {
        throw new ValidationError('Cannot start stream in current state');
      }

      stream.startSession();
      stream.completeStart();
      await this.streamRepository.save(stream);

      // Create event
      const event = StreamEventEntity.createStreamStarted(streamId, userId);
      await this.eventRepository.save(event);

      // Track analytics
      await this.analyticsService.trackStreamEvent(streamId, 'stream_started', {
        userId,
        timestamp: new Date().toISOString()
      });

      // Emit WebSocket event
      await this.webSocketService.emitToRoom(`stream:${streamId}`, 'streamStarted', {
        streamId,
        status: stream.status
      });

      this.logger.info(`Stream started: ${streamId} by user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to start stream:', error);
      throw error;
    }
  }

  /**
   * Stop a stream
   */
  async stopStream(streamId: string, userId: string): Promise<void> {
    try {
      const stream = await this.findStreamByIdAndUser(streamId, userId);

      if (!stream.canStop()) {
        throw new ValidationError('Cannot stop stream in current state');
      }

      const duration = stream.getDuration();
      stream.stopSession();
      stream.completeStop();
      await this.streamRepository.save(stream);

      // Create event
      const event = StreamEventEntity.createStreamStopped(streamId, userId, duration || 0);
      await this.eventRepository.save(event);

      // Track analytics
      await this.analyticsService.trackStreamEvent(streamId, 'stream_stopped', {
        userId,
        duration,
        timestamp: new Date().toISOString()
      });

      // Emit WebSocket event
      await this.webSocketService.emitToRoom(`stream:${streamId}`, 'streamStopped', {
        streamId,
        status: stream.status,
        duration
      });

      this.logger.info(`Stream stopped: ${streamId} by user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to stop stream:', error);
      throw error;
    }
  }

  /**
   * Pause a stream
   */
  async pauseStream(streamId: string, userId: string): Promise<void> {
    try {
      const stream = await this.findStreamByIdAndUser(streamId, userId);

      if (!stream.canPause()) {
        throw new ValidationError('Cannot pause stream in current state');
      }

      stream.pause();
      await this.streamRepository.save(stream);

      // Create event
      const event = new StreamEventEntity();
      event.streamId = streamId;
      event.type = StreamEventType.STREAM_PAUSED;
      event.data = { userId, timestamp: new Date().toISOString() };
      await this.eventRepository.save(event);

      this.logger.info(`Stream paused: ${streamId} by user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to pause stream:', error);
      throw error;
    }
  }

  /**
   * Resume a stream
   */
  async resumeStream(streamId: string, userId: string): Promise<void> {
    try {
      const stream = await this.findStreamByIdAndUser(streamId, userId);

      if (!stream.canResume()) {
        throw new ValidationError('Cannot resume stream in current state');
      }

      stream.resume();
      await this.streamRepository.save(stream);

      // Create event
      const event = new StreamEventEntity();
      event.streamId = streamId;
      event.type = StreamEventType.STREAM_RESUMED;
      event.data = { userId, timestamp: new Date().toISOString() };
      await this.eventRepository.save(event);

      this.logger.info(`Stream resumed: ${streamId} by user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to resume stream:', error);
      throw error;
    }
  }

  async deleteStream(streamId: string, userId: string): Promise<void> {
    throw new Error('Not implemented yet');
  }

  async updateStreamConfig(streamId: string, userId: string, config: Partial<StreamConfiguration>): Promise<StreamMetadata> {
    throw new Error('Not implemented yet');
  }

  async updateStreamQuality(streamId: string, userId: string, quality: any): Promise<void> {
    throw new Error('Not implemented yet');
  }

  async getStream(streamId: string): Promise<StreamMetadata> {
    throw new Error('Not implemented yet');
  }

  async getStreamsByUser(userId: string, query?: StreamQuery): Promise<StreamDiscovery> {
    throw new Error('Not implemented yet');
  }

  /**
   * Discover streams with filters
   */
  async discoverStreams(query?: StreamQuery): Promise<StreamDiscovery> {
    try {
      const page = query?.page || 1;
      const limit = query?.limit || 20;
      const offset = (page - 1) * limit;

      const queryBuilder = this.streamRepository.createQueryBuilder('stream');

      // Apply filters
      if (query?.filters) {
        if (query.filters.status) {
          queryBuilder.andWhere('stream.status IN (:...statuses)', { 
            statuses: query.filters.status 
          });
        }

        if (query.filters.isPublic !== undefined) {
          queryBuilder.andWhere('stream.isPublic = :isPublic', { 
            isPublic: query.filters.isPublic 
          });
        }

        if (query.filters.userId) {
          queryBuilder.andWhere('stream.userId = :userId', { 
            userId: query.filters.userId 
          });
        }

        if (query.filters.tags && query.filters.tags.length > 0) {
          queryBuilder.andWhere('JSON_OVERLAPS(stream.tags, :tags)', { 
            tags: JSON.stringify(query.filters.tags) 
          });
        }
      }

      // Default to public streams if no specific filters
      if (!query?.filters?.isPublic) {
        queryBuilder.andWhere('stream.isPublic = true');
      }

      // Sorting
      const sortBy = query?.filters?.sortBy || 'createdAt';
      const sortOrder = query?.filters?.sortOrder || 'desc';
      queryBuilder.orderBy(`stream.${sortBy}`, sortOrder.toUpperCase() as 'ASC' | 'DESC');

      // Get results
      const [streams, totalCount] = await Promise.all([
        queryBuilder.offset(offset).limit(limit).getMany(),
        queryBuilder.getCount()
      ]);

      return {
        streams: streams.map(stream => this.mapStreamToMetadata(stream)),
        totalCount,
        page,
        limit,
        filters: query?.filters || {}
      };
    } catch (error) {
      this.logger.error('Failed to discover streams:', error);
      throw new Error('Failed to discover streams');
    }
  }

  /**
   * Search streams by title and description
   */
  async searchStreams(searchTerm: string, query?: StreamQuery): Promise<StreamDiscovery> {
    try {
      const page = query?.page || 1;
      const limit = query?.limit || 20;
      const offset = (page - 1) * limit;

      const queryBuilder = this.streamRepository.createQueryBuilder('stream')
        .where('LOWER(stream.title) LIKE :search OR LOWER(stream.description) LIKE :search', {
          search: `%${searchTerm.toLowerCase()}%`
        })
        .andWhere('stream.isPublic = true');

      // Apply additional filters
      if (query?.filters?.status) {
        queryBuilder.andWhere('stream.status IN (:...statuses)', { 
          statuses: query.filters.status 
        });
      }

      // Sorting
      queryBuilder.orderBy('stream.currentViewers', 'DESC')
        .addOrderBy('stream.createdAt', 'DESC');

      // Get results
      const [streams, totalCount] = await Promise.all([
        queryBuilder.offset(offset).limit(limit).getMany(),
        queryBuilder.getCount()
      ]);

      return {
        streams: streams.map(stream => this.mapStreamToMetadata(stream)),
        totalCount,
        page,
        limit,
        filters: { search: searchTerm, ...query?.filters }
      };
    } catch (error) {
      this.logger.error('Failed to search streams:', error);
      throw new Error('Failed to search streams');
    }
  }

  async getStreamStats(streamId: string): Promise<StreamStats> {
    throw new Error('Not implemented yet');
  }

  async getStreamHealth(streamId: string): Promise<StreamStatus> {
    throw new Error('Not implemented yet');
  }

  /**
   * Update stream health status
   */
  async updateStreamHealth(streamId: string, health: StreamHealth): Promise<void> {
    try {
      const stream = await this.streamRepository.findOne({
        where: { id: streamId }
      });

      if (!stream) {
        throw new ValidationError('Stream not found');
      }

      const previousHealth = stream.health;
      stream.updateHealth(health);
      await this.streamRepository.save(stream);

      // Create event
      const event = StreamEventEntity.createHealthUpdated(streamId, health, previousHealth);
      await this.eventRepository.save(event);

      // Emit WebSocket event for critical health issues
      if (stream.hasHealthIssues()) {
        await this.webSocketService.emitToRoom(`stream:${streamId}`, 'healthUpdated', {
          streamId,
          health,
          previousHealth,
          isCritical: health === StreamHealth.CRITICAL
        });
      }

      this.logger.info(`Stream health updated: ${streamId} -> ${health}`);
    } catch (error) {
      this.logger.error('Failed to update stream health:', error);
      throw error;
    }
  }

  /**
   * Start recording for a stream
   */
  async startRecording(streamId: string, userId: string): Promise<void> {
    try {
      const stream = await this.findStreamByIdAndUser(streamId, userId);

      if (!stream.isLive()) {
        throw new ValidationError('Cannot record stream that is not live');
      }

      if (!stream.recordingEnabled) {
        throw new ValidationError('Recording is not enabled for this stream');
      }

      // Create event
      const event = StreamEventEntity.createRecordingStarted(streamId, crypto.randomUUID());
      await this.eventRepository.save(event);

      // Track analytics
      await this.analyticsService.trackStreamEvent(streamId, 'recording_started', {
        userId,
        timestamp: new Date().toISOString()
      });

      this.logger.info(`Recording started for stream: ${streamId}`);
    } catch (error) {
      this.logger.error('Failed to start recording:', error);
      throw error;
    }
  }

  /**
   * Stop recording and create recording entity
   */
  async stopRecording(streamId: string, userId: string): Promise<StreamRecording> {
    try {
      const stream = await this.findStreamByIdAndUser(streamId, userId);
      
      // Simulate recording data (in real implementation, this would come from recording service)
      const duration = 300; // 5 minutes
      const fileSize = 50000000; // 50MB
      const recordingUrl = `https://cdn.example.com/recordings/${crypto.randomUUID()}.mp4`;

      const recording = StreamRecordingEntity.createFromStream(stream, duration, fileSize, recordingUrl);
      const savedRecording = await this.recordingRepository.save(recording);

      // Create event
      const event = StreamEventEntity.createRecordingStopped(streamId, savedRecording.id, duration, fileSize);
      await this.eventRepository.save(event);

      // Track analytics
      await this.analyticsService.trackStreamEvent(streamId, 'recording_stopped', {
        userId,
        recordingId: savedRecording.id,
        duration,
        fileSize,
        timestamp: new Date().toISOString()
      });

      this.logger.info(`Recording stopped for stream: ${streamId}, recording: ${savedRecording.id}`);

      return this.mapRecordingToInterface(savedRecording);
    } catch (error) {
      this.logger.error('Failed to stop recording:', error);
      throw error;
    }
  }

  /**
   * Get recordings for a stream
   */
  async getRecordings(streamId: string): Promise<StreamRecording[]> {
    try {
      const recordings = await this.recordingRepository.find({
        where: { streamId },
        order: { createdAt: 'DESC' }
      });

      return recordings.map(recording => this.mapRecordingToInterface(recording));
    } catch (error) {
      this.logger.error('Failed to get recordings:', error);
      throw new Error('Failed to get recordings');
    }
  }

  async getRecording(recordingId: string): Promise<StreamRecording> {
    throw new Error('Not implemented yet');
  }

  async deleteRecording(recordingId: string, userId: string): Promise<void> {
    throw new Error('Not implemented yet');
  }

  /**
   * Add viewer to stream
   */
  async addViewer(streamId: string, viewerId: string): Promise<void> {
    try {
      const stream = await this.streamRepository.findOne({
        where: { id: streamId }
      });

      if (!stream) {
        throw new ValidationError('Stream not found');
      }

      if (!stream.isLive()) {
        throw new ValidationError('Cannot join stream that is not live');
      }

      stream.addViewer();
      await this.streamRepository.save(stream);

      // Create event
      const event = StreamEventEntity.createViewerJoined(streamId, viewerId);
      await this.eventRepository.save(event);

      // Emit WebSocket event
      await this.webSocketService.emitToRoom(`stream:${streamId}`, 'viewerJoined', {
        streamId,
        viewerId,
        currentViewers: stream.currentViewers
      });

      this.logger.debug(`Viewer joined stream: ${viewerId} -> ${streamId}`);
    } catch (error) {
      this.logger.error('Failed to add viewer:', error);
      throw error;
    }
  }

  /**
   * Remove viewer from stream
   */
  async removeViewer(streamId: string, viewerId: string): Promise<void> {
    try {
      const stream = await this.streamRepository.findOne({
        where: { id: streamId }
      });

      if (!stream) {
        throw new ValidationError('Stream not found');
      }

      stream.removeViewer();
      await this.streamRepository.save(stream);

      // Create event
      const event = StreamEventEntity.createViewerLeft(streamId, viewerId);
      await this.eventRepository.save(event);

      // Emit WebSocket event
      await this.webSocketService.emitToRoom(`stream:${streamId}`, 'viewerLeft', {
        streamId,
        viewerId,
        currentViewers: stream.currentViewers
      });

      this.logger.debug(`Viewer left stream: ${viewerId} -> ${streamId}`);
    } catch (error) {
      this.logger.error('Failed to remove viewer:', error);
      throw error;
    }
  }

  async getViewers(streamId: string): Promise<string[]> {
    throw new Error('Not implemented yet');
  }

  /**
   * Emit stream event
   */
  async emitStreamEvent(event: Omit<StreamEvent, 'id' | 'timestamp'>): Promise<void> {
    try {
      const streamEvent = new StreamEventEntity();
      streamEvent.streamId = event.streamId;
      streamEvent.type = event.type;
      streamEvent.data = event.data;

      await this.eventRepository.save(streamEvent);

      // Emit via WebSocket
      await this.webSocketService.emitToRoom(`stream:${event.streamId}`, 'streamEvent', {
        ...event,
        id: streamEvent.id,
        timestamp: streamEvent.timestamp
      });

      this.logger.debug(`Stream event emitted: ${event.type} for ${event.streamId}`);
    } catch (error) {
      this.logger.error('Failed to emit stream event:', error);
      throw error;
    }
  }

  /**
   * Get stream events with pagination
   */
  async getStreamEvents(streamId: string, limit?: number): Promise<StreamEvent[]> {
    try {
      const events = await this.eventRepository.find({
        where: { streamId },
        order: { timestamp: 'DESC' },
        take: limit || 50
      });

      return events.map(event => event.toSafeJSON());
    } catch (error) {
      this.logger.error('Failed to get stream events:', error);
      throw new Error('Failed to get stream events');
    }
  }

  async getStreamStatistics(): Promise<{
    totalStreams: number;
    activeStreams: number;
    totalViews: number;
    totalRecordings: number;
    averageViewDuration: number;
    topStreams: Array<{
      streamId: string;
      title: string;
      viewers: number;
      views: number;
    }>;
  }> {
    throw new Error('Not implemented yet');
  }

  /**
   * Private helper methods
   */

  private async findStreamByIdAndUser(streamId: string, userId: string): Promise<Stream> {
    const stream = await this.streamRepository.findOne({
      where: { id: streamId }
    });

    if (!stream) {
      throw new ValidationError('Stream not found');
    }

    if (stream.userId !== userId) {
      throw new ValidationError('Unauthorized: You do not own this stream');
    }

    return stream;
  }

  private mapStreamToMetadata(stream: Stream): StreamMetadata {
    return {
      id: stream.id,
      title: stream.title,
      description: stream.description || undefined,
      userId: stream.userId,
      status: {
        state: stream.status,
        health: stream.health,
        uptime: stream.uptime || undefined,
        lastHealthCheck: stream.lastHealthCheck || undefined,
        errorMessage: stream.errorMessage || undefined
      },
      quality: {
        resolution: stream.resolution,
        bitrate: stream.bitrate,
        framerate: stream.framerate,
        codec: stream.codec
      },
      isPublic: stream.isPublic,
      recordingEnabled: stream.recordingEnabled,
      adDetectionEnabled: stream.adDetectionEnabled,
      maxViewers: stream.maxViewers || undefined,
      currentViewers: stream.currentViewers,
      tags: stream.tags || [],
      thumbnailUrl: stream.thumbnailUrl || undefined,
      streamUrl: stream.streamUrl || undefined,
      rtmpUrl: stream.rtmpUrl || undefined,
      createdAt: stream.createdAt,
      updatedAt: stream.updatedAt,
      startedAt: stream.startedAt || undefined,
      endedAt: stream.endedAt || undefined
    };
  }

  private mapRecordingToInterface(recording: StreamRecordingEntity): StreamRecording {
    return {
      id: recording.id,
      streamId: recording.streamId,
      userId: recording.userId,
      title: recording.title,
      duration: recording.duration,
      fileSize: recording.fileSize,
      quality: {
        resolution: recording.resolution,
        bitrate: recording.bitrate,
        framerate: recording.framerate,
        codec: recording.codec
      },
      thumbnailUrl: recording.thumbnailUrl || undefined,
      recordingUrl: recording.recordingUrl,
      adDetections: recording.adDetections,
      createdAt: recording.createdAt,
      processingStatus: recording.processingStatus
    };
  }
}
import { IWebSocketService, WebSocketMessage } from '@/interfaces/IWebSocketService';
import { Logger } from '@/utils/Logger';
import { EventEmitter } from 'events';

/**
 * Realtime Notification Service
 * 
 * Provides high-level notification and real-time update functionality
 * Built on top of the WebSocket service for business logic notifications
 * 
 * Single Responsibility: Handle application-level real-time notifications
 * Open/Closed: Extensible for new notification types
 * Liskov Substitution: Uses standard notification interfaces
 * Interface Segregation: Focused on notification logic
 * Dependency Inversion: Uses injected WebSocket service
 */

export interface NotificationPayload {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  data?: any;
  actions?: NotificationAction[];
  expiresAt?: Date;
  userId?: string;
  groupId?: string;
}

export interface NotificationAction {
  id: string;
  label: string;
  action: string;
  style?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
}

export interface LiveUpdate {
  id: string;
  type: string;
  resource: string;
  resourceId: string;
  action: 'created' | 'updated' | 'deleted';
  data: any;
  timestamp: string;
  userId?: string;
}

export class RealtimeNotificationService extends EventEmitter {
  private logger: Logger;
  private notifications: Map<string, NotificationPayload> = new Map();

  constructor(private webSocketService: IWebSocketService) {
    super();
    this.logger = new Logger('RealtimeNotificationService');
    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for WebSocket events
   */
  private setupEventHandlers(): void {
    this.webSocketService.on('message', (clientId, message) => {
      this.handleWebSocketMessage(clientId, message);
    });

    this.webSocketService.on('client_connected', (client) => {
      this.sendPendingNotifications(client.userId);
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleWebSocketMessage(clientId: string, message: WebSocketMessage): void {
    switch (message.type) {
      case 'notification_read':
        this.handleNotificationRead(clientId, message);
        break;
      case 'notification_action':
        this.handleNotificationAction(clientId, message);
        break;
      case 'get_notifications':
        this.sendNotificationHistory(clientId, message);
        break;
    }
  }

  /**
   * Send notification to users
   */
  public sendNotification(notification: Omit<NotificationPayload, 'id'>): string {
    const notificationId = this.generateNotificationId();
    const fullNotification: NotificationPayload = {
      id: notificationId,
      ...notification
    };

    // Store notification
    this.notifications.set(notificationId, fullNotification);

    // Send to specific user or broadcast
    if (notification.userId) {
      this.sendToUser(notification.userId, fullNotification);
    } else if (notification.groupId) {
      this.sendToGroup(notification.groupId, fullNotification);
    } else {
      this.broadcastNotification(fullNotification);
    }

    this.logger.info(`Notification sent: ${notification.type} - ${notification.title}`);
    this.emit('notification_sent', fullNotification);

    return notificationId;
  }

  /**
   * Send live update to subscribed clients
   */
  public sendLiveUpdate(update: Omit<LiveUpdate, 'id' | 'timestamp'>): string {
    const updateId = this.generateUpdateId();
    const fullUpdate: LiveUpdate = {
      id: updateId,
      timestamp: new Date().toISOString(),
      ...update
    };

    // Determine channel based on resource
    const channel = `updates.${update.resource}`;
    
    this.webSocketService.broadcastToChannel(channel, {
      type: 'live_update',
      timestamp: new Date().toISOString(),
      data: fullUpdate
    });

    this.logger.debug(`Live update sent: ${update.action} ${update.resource}:${update.resourceId}`);
    this.emit('live_update_sent', fullUpdate);

    return updateId;
  }

  /**
   * Send content-related notifications
   */
  public notifyContentUploaded(contentId: string, title: string, userId: string): void {
    this.sendNotification({
      type: 'content_uploaded',
      title: 'Content Upload Complete',
      message: `"${title}" has been uploaded successfully`,
      priority: 'normal',
      userId,
      data: { contentId, title }
    });

    this.sendLiveUpdate({
      type: 'content_uploaded',
      resource: 'content',
      resourceId: contentId,
      action: 'created',
      data: { title },
      userId
    });
  }

  public notifyContentProcessing(contentId: string, title: string, userId: string): void {
    this.sendNotification({
      type: 'content_processing',
      title: 'Processing Content',
      message: `"${title}" is being processed`,
      priority: 'low',
      userId,
      data: { contentId, title }
    });
  }

  public notifyContentReady(contentId: string, title: string, userId: string): void {
    this.sendNotification({
      type: 'content_ready',
      title: 'Content Ready',
      message: `"${title}" is ready for scheduling`,
      priority: 'normal',
      userId,
      data: { contentId, title },
      actions: [
        { id: 'schedule', label: 'Schedule Now', action: 'schedule_content' },
        { id: 'view', label: 'View Details', action: 'view_content' }
      ]
    });
  }

  /**
   * Send schedule-related notifications
   */
  public notifyScheduleExecuted(scheduleId: string, scheduleName: string, success: boolean): void {
    this.sendNotification({
      type: success ? 'schedule_executed' : 'schedule_failed',
      title: success ? 'Schedule Executed' : 'Schedule Failed',
      message: `Schedule "${scheduleName}" ${success ? 'executed successfully' : 'failed to execute'}`,
      priority: success ? 'normal' : 'high',
      data: { scheduleId, scheduleName, success }
    });

    this.sendLiveUpdate({
      type: 'schedule_executed',
      resource: 'schedule',
      resourceId: scheduleId,
      action: 'updated',
      data: { scheduleName, success }
    });
  }

  public notifyScheduleUpcoming(scheduleId: string, scheduleName: string, minutesUntil: number): void {
    if (minutesUntil <= 5) {
      this.sendNotification({
        type: 'schedule_upcoming',
        title: 'Schedule Starting Soon',
        message: `"${scheduleName}" will start in ${minutesUntil} minute${minutesUntil !== 1 ? 's' : ''}`,
        priority: 'high',
        data: { scheduleId, scheduleName, minutesUntil }
      });
    }
  }

  /**
   * Send PiP-related notifications
   */
  public notifyPiPTriggered(sessionId: string, contentId: string, reason: string): void {
    this.sendNotification({
      type: 'pip_triggered',
      title: 'Picture-in-Picture Activated',
      message: `PiP mode activated: ${reason}`,
      priority: 'normal',
      data: { sessionId, contentId, reason },
      actions: [
        { id: 'view', label: 'View PiP', action: 'view_pip' },
        { id: 'stop', label: 'Stop PiP', action: 'stop_pip', style: 'danger' }
      ]
    });

    this.sendLiveUpdate({
      type: 'pip_triggered',
      resource: 'pip_session',
      resourceId: sessionId,
      action: 'created',
      data: { contentId, reason }
    });
  }

  public notifyPiPEnded(sessionId: string, reason: string): void {
    this.sendNotification({
      type: 'pip_ended',
      title: 'Picture-in-Picture Ended',
      message: `PiP session ended: ${reason}`,
      priority: 'low',
      data: { sessionId, reason }
    });

    this.sendLiveUpdate({
      type: 'pip_ended',
      resource: 'pip_session',
      resourceId: sessionId,
      action: 'deleted',
      data: { reason }
    });
  }

  /**
   * Send ad detection notifications
   */
  public notifyAdDetected(detectionId: string, streamId: string, adType: string, confidence: number): void {
    this.sendNotification({
      type: 'ad_detected',
      title: 'Advertisement Detected',
      message: `${adType} detected on ${streamId} (${Math.round(confidence * 100)}% confidence)`,
      priority: 'normal',
      data: { detectionId, streamId, adType, confidence }
    });

    this.sendLiveUpdate({
      type: 'ad_detected',
      resource: 'ad_detection',
      resourceId: detectionId,
      action: 'created',
      data: { streamId, adType, confidence }
    });
  }

  /**
   * Send system notifications
   */
  public notifySystemAlert(message: string, priority: 'low' | 'normal' | 'high' | 'urgent' = 'high'): void {
    this.sendNotification({
      type: 'system_alert',
      title: 'System Alert',
      message,
      priority,
      data: { timestamp: new Date().toISOString() }
    });
  }

  public notifySystemMaintenance(message: string, scheduledAt?: Date): void {
    this.sendNotification({
      type: 'system_maintenance',
      title: 'Scheduled Maintenance',
      message,
      priority: 'high',
      data: { scheduledAt: scheduledAt?.toISOString() }
    });
  }

  /**
   * Send user activity notifications
   */
  public notifyUserActivity(action: string, resource: string, resourceId: string, userId: string, details?: any): void {
    this.sendLiveUpdate({
      type: 'user_activity',
      resource: 'activity',
      resourceId: `${userId}_${Date.now()}`,
      action: 'created',
      data: { action, resource, resourceId, userId, details },
      userId
    });
  }

  /**
   * Send notification to specific user
   */
  private sendToUser(userId: string, notification: NotificationPayload): void {
    this.webSocketService.sendToUser(userId, {
      type: 'notification',
      timestamp: new Date().toISOString(),
      data: notification
    });
  }

  /**
   * Send notification to group/room
   */
  private sendToGroup(groupId: string, notification: NotificationPayload): void {
    this.webSocketService.broadcastToRoom(groupId, {
      type: 'notification',
      timestamp: new Date().toISOString(),
      data: notification
    });
  }

  /**
   * Broadcast notification to all users
   */
  private broadcastNotification(notification: NotificationPayload): void {
    this.webSocketService.broadcastToChannel('notifications', {
      type: 'notification',
      timestamp: new Date().toISOString(),
      data: notification
    });
  }

  /**
   * Handle notification read acknowledgment
   */
  private handleNotificationRead(clientId: string, message: WebSocketMessage): void {
    const { notificationId } = message.data;
    const notification = this.notifications.get(notificationId);
    
    if (notification) {
      this.logger.debug(`Notification ${notificationId} marked as read by client ${clientId}`);
      this.emit('notification_read', notificationId, clientId);
    }
  }

  /**
   * Handle notification action
   */
  private handleNotificationAction(clientId: string, message: WebSocketMessage): void {
    const { notificationId, actionId } = message.data;
    const notification = this.notifications.get(notificationId);
    
    if (notification) {
      const action = notification.actions?.find(a => a.id === actionId);
      if (action) {
        this.logger.debug(`Notification action ${actionId} triggered for ${notificationId}`);
        this.emit('notification_action', notificationId, actionId, clientId);
      }
    }
  }

  /**
   * Send notification history to client
   */
  private sendNotificationHistory(clientId: string, message: WebSocketMessage): void {
    const client = this.webSocketService.getClient(clientId);
    if (!client) return;

    const userNotifications = Array.from(this.notifications.values())
      .filter(n => !n.userId || n.userId === client.userId)
      .slice(-50) // Last 50 notifications
      .sort((a, b) => (b.expiresAt?.getTime() || 0) - (a.expiresAt?.getTime() || 0));

    this.webSocketService.broadcastToChannel('notifications', {
      type: 'notification_history',
      timestamp: new Date().toISOString(),
      data: { notifications: userNotifications },
      requestId: message.requestId
    });
  }

  /**
   * Send pending notifications to newly connected user
   */
  private sendPendingNotifications(userId: string | null): void {
    if (!userId) return;

    const pendingNotifications = Array.from(this.notifications.values())
      .filter(n => n.userId === userId && (!n.expiresAt || n.expiresAt > new Date()));

    for (const notification of pendingNotifications) {
      this.sendToUser(userId, notification);
    }
  }

  /**
   * Clean up expired notifications
   */
  public cleanupExpiredNotifications(): void {
    const now = new Date();
    let cleanedCount = 0;

    for (const [id, notification] of this.notifications) {
      if (notification.expiresAt && notification.expiresAt < now) {
        this.notifications.delete(id);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} expired notifications`);
    }
  }

  /**
   * Get notification statistics
   */
  public getStats() {
    const notifications = Array.from(this.notifications.values());
    return {
      totalNotifications: notifications.length,
      byType: notifications.reduce((acc, n) => {
        acc[n.type] = (acc[n.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byPriority: notifications.reduce((acc, n) => {
        acc[n.priority] = (acc[n.priority] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      expired: notifications.filter(n => n.expiresAt && n.expiresAt < new Date()).length
    };
  }

  /**
   * Generate unique notification ID
   */
  private generateNotificationId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique update ID
   */
  private generateUpdateId(): string {
    return `update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
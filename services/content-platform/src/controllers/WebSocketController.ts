import { Request, Response } from 'express';
import { IWebSocketService } from '@/interfaces/IWebSocketService';
import { BaseController } from '@/controllers/BaseController';
import { ValidationError } from '@/utils/validation';

/**
 * WebSocket Controller
 * 
 * Handles HTTP requests for WebSocket management and monitoring
 * Provides REST API endpoints for WebSocket statistics and control
 * 
 * Single Responsibility: Handle WebSocket-related HTTP requests
 * Open/Closed: Extensible for additional WebSocket endpoints
 * Liskov Substitution: Uses standard Express interfaces
 * Interface Segregation: Focused on WebSocket HTTP handling
 * Dependency Inversion: Uses injected WebSocket service
 */

export class WebSocketController extends BaseController {
  constructor(private webSocketService: IWebSocketService) {
    super();
  }

  /**
   * Get WebSocket server statistics
   * GET /api/v1/websocket/stats
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = this.webSocketService.getStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get connected clients
   * GET /api/v1/websocket/clients
   */
  async getClients(req: Request, res: Response): Promise<void> {
    try {
      const clients = this.webSocketService.getClients();
      
      // Remove socket object for JSON serialization
      const clientData = clients.map(client => ({
        id: client.id,
        userId: client.userId,
        userRole: client.userRole,
        isAuthenticated: client.isAuthenticated,
        connectedAt: client.connectedAt,
        lastActivity: client.lastActivity,
        subscriptions: Array.from(client.subscriptions),
        metadata: client.metadata
      }));

      res.json({
        success: true,
        data: clientData,
        meta: {
          total: clientData.length,
          authenticated: clientData.filter(c => c.isAuthenticated).length
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get clients for a specific user
   * GET /api/v1/websocket/users/:userId/clients
   */
  async getUserClients(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      const clients = this.webSocketService.getClientsByUser(userId);
      
      const clientData = clients.map(client => ({
        id: client.id,
        userId: client.userId,
        userRole: client.userRole,
        isAuthenticated: client.isAuthenticated,
        connectedAt: client.connectedAt,
        lastActivity: client.lastActivity,
        subscriptions: Array.from(client.subscriptions),
        metadata: client.metadata
      }));

      res.json({
        success: true,
        data: clientData,
        meta: {
          userId,
          connections: clientData.length
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get all active rooms
   * GET /api/v1/websocket/rooms
   */
  async getRooms(req: Request, res: Response): Promise<void> {
    try {
      const rooms = this.webSocketService.getRooms();
      
      const roomData = rooms.map(room => ({
        id: room.id,
        name: room.name,
        clients: Array.from(room.clients),
        clientCount: room.clients.size,
        metadata: room.metadata
      }));

      res.json({
        success: true,
        data: roomData,
        meta: {
          total: roomData.length,
          totalClients: roomData.reduce((sum, room) => sum + room.clientCount, 0)
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get specific room information
   * GET /api/v1/websocket/rooms/:roomId
   */
  async getRoom(req: Request, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;

      if (!roomId) {
        throw new ValidationError('Room ID is required');
      }

      const room = this.webSocketService.getRoom(roomId);
      
      if (!room) {
        res.status(404).json({
          success: false,
          message: 'Room not found'
        });
        return;
      }

      // Get client details for room members
      const clients = Array.from(room.clients)
        .map(clientId => this.webSocketService.getClient(clientId))
        .filter(client => client !== undefined)
        .map(client => ({
          id: client!.id,
          userId: client!.userId,
          userRole: client!.userRole,
          isAuthenticated: client!.isAuthenticated,
          connectedAt: client!.connectedAt,
          lastActivity: client!.lastActivity
        }));

      res.json({
        success: true,
        data: {
          id: room.id,
          name: room.name,
          clients,
          clientCount: clients.length,
          metadata: room.metadata
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Broadcast message to all clients
   * POST /api/v1/websocket/broadcast
   * Body: { type: string, data: any, exclude?: string[] }
   */
  async broadcastToAll(req: Request, res: Response): Promise<void> {
    try {
      const { type, data, exclude } = req.body;

      if (!type) {
        throw new ValidationError('Message type is required');
      }

      this.webSocketService.broadcastToAll({
        type,
        timestamp: new Date().toISOString(),
        data
      }, exclude);

      res.json({
        success: true,
        message: 'Message broadcasted to all clients',
        data: {
          type,
          timestamp: new Date().toISOString(),
          excludedClients: exclude?.length || 0
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Broadcast message to specific channel
   * POST /api/v1/websocket/channels/:channel/broadcast
   * Body: { type: string, data: any, exclude?: string[] }
   */
  async broadcastToChannel(req: Request, res: Response): Promise<void> {
    try {
      const { channel } = req.params;
      const { type, data, exclude } = req.body;

      if (!channel) {
        throw new ValidationError('Channel is required');
      }

      if (!type) {
        throw new ValidationError('Message type is required');
      }

      this.webSocketService.broadcastToChannel(channel, {
        type,
        timestamp: new Date().toISOString(),
        data
      }, exclude);

      res.json({
        success: true,
        message: `Message broadcasted to channel: ${channel}`,
        data: {
          channel,
          type,
          timestamp: new Date().toISOString(),
          excludedClients: exclude?.length || 0
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Broadcast message to specific room
   * POST /api/v1/websocket/rooms/:roomId/broadcast
   * Body: { type: string, data: any, exclude?: string[] }
   */
  async broadcastToRoom(req: Request, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const { type, data, exclude } = req.body;

      if (!roomId) {
        throw new ValidationError('Room ID is required');
      }

      if (!type) {
        throw new ValidationError('Message type is required');
      }

      const room = this.webSocketService.getRoom(roomId);
      if (!room) {
        res.status(404).json({
          success: false,
          message: 'Room not found'
        });
        return;
      }

      this.webSocketService.broadcastToRoom(roomId, {
        type,
        timestamp: new Date().toISOString(),
        data
      }, exclude);

      res.json({
        success: true,
        message: `Message broadcasted to room: ${roomId}`,
        data: {
          roomId,
          roomName: room.name,
          type,
          timestamp: new Date().toISOString(),
          clientCount: room.clients.size,
          excludedClients: exclude?.length || 0
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Send message to specific user
   * POST /api/v1/websocket/users/:userId/send
   * Body: { type: string, data: any }
   */
  async sendToUser(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { type, data } = req.body;

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      if (!type) {
        throw new ValidationError('Message type is required');
      }

      const userClients = this.webSocketService.getClientsByUser(userId);
      if (userClients.length === 0) {
        res.status(404).json({
          success: false,
          message: 'User not connected'
        });
        return;
      }

      this.webSocketService.sendToUser(userId, {
        type,
        timestamp: new Date().toISOString(),
        data
      });

      res.json({
        success: true,
        message: `Message sent to user: ${userId}`,
        data: {
          userId,
          type,
          timestamp: new Date().toISOString(),
          connections: userClients.length
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get channel subscription statistics
   * GET /api/v1/websocket/channels/stats
   */
  async getChannelStats(req: Request, res: Response): Promise<void> {
    try {
      const clients = this.webSocketService.getClients();
      const channelStats: Record<string, number> = {};

      // Count subscriptions per channel
      clients.forEach(client => {
        client.subscriptions.forEach(channel => {
          channelStats[channel] = (channelStats[channel] || 0) + 1;
        });
      });

      // Sort by subscriber count
      const sortedChannels = Object.entries(channelStats)
        .sort(([, a], [, b]) => b - a)
        .map(([channel, subscribers]) => ({ channel, subscribers }));

      res.json({
        success: true,
        data: {
          channels: sortedChannels,
          totalChannels: sortedChannels.length,
          totalSubscriptions: Object.values(channelStats).reduce((sum, count) => sum + count, 0)
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Test WebSocket connectivity
   * POST /api/v1/websocket/test
   * Body: { message?: string }
   */
  async testConnection(req: Request, res: Response): Promise<void> {
    try {
      const { message } = req.body;
      const testMessage = message || 'WebSocket connectivity test';

      this.webSocketService.broadcastToAll({
        type: 'test_message',
        timestamp: new Date().toISOString(),
        data: {
          message: testMessage,
          test: true
        }
      });

      const stats = this.webSocketService.getStats();

      res.json({
        success: true,
        message: 'Test message sent to all connected clients',
        data: {
          testMessage,
          timestamp: new Date().toISOString(),
          stats
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Force disconnect a client
   * POST /api/v1/websocket/clients/:clientId/disconnect
   */
  async disconnectClient(req: Request, res: Response): Promise<void> {
    try {
      const { clientId } = req.params;
      const { reason } = req.body;

      if (!clientId) {
        throw new ValidationError('Client ID is required');
      }

      const client = this.webSocketService.getClient(clientId);
      if (!client) {
        res.status(404).json({
          success: false,
          message: 'Client not found'
        });
        return;
      }

      // Close the client connection
      client.socket.close(1000, reason || 'Disconnected by admin');

      res.json({
        success: true,
        message: `Client ${clientId} disconnected`,
        data: {
          clientId,
          userId: client.userId,
          reason: reason || 'Disconnected by admin'
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }
}
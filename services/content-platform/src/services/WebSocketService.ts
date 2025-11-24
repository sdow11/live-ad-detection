import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { EventEmitter } from 'events';
import { Logger } from '@/utils/Logger';
import jwt from 'jsonwebtoken';

/**
 * WebSocket Service
 * 
 * Provides real-time communication infrastructure for the Content Platform
 * Enables live updates, notifications, and multi-user collaboration
 * 
 * Single Responsibility: Manage WebSocket connections and real-time messaging
 * Open/Closed: Extensible for new message types and handlers
 * Liskov Substitution: Implements standard event-driven interfaces
 * Interface Segregation: Focused on real-time communication
 * Dependency Inversion: Uses event-driven architecture for loose coupling
 */

export interface WebSocketMessage {
  type: string;
  timestamp: string;
  data: any;
  requestId?: string;
  userId?: string;
}

export interface WebSocketClient {
  id: string;
  userId: string | null;
  userRole: string | null;
  socket: WebSocket;
  isAuthenticated: boolean;
  connectedAt: Date;
  lastActivity: Date;
  subscriptions: Set<string>;
  metadata?: Record<string, any>;
}

export interface WebSocketRoom {
  id: string;
  name: string;
  clients: Set<string>;
  metadata?: Record<string, any>;
}

export class WebSocketService extends EventEmitter {
  private server: WebSocketServer;
  private clients: Map<string, WebSocketClient> = new Map();
  private rooms: Map<string, WebSocketRoom> = new Map();
  private logger: Logger;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(port: number = 8080, private jwtSecret: string = process.env.JWT_SECRET || 'default-secret') {
    super();
    this.logger = new Logger('WebSocketService');
    
    this.server = new WebSocketServer({ 
      port,
      verifyClient: this.verifyClient.bind(this)
    });

    this.setupServer();
    this.startHeartbeat();
    this.startCleanup();
    
    this.logger.info(`WebSocket server started on port ${port}`);
  }

  /**
   * Verify client connection (authentication)
   */
  private verifyClient(info: { origin: string; secure: boolean; req: IncomingMessage }): boolean {
    try {
      // Extract token from query string or Authorization header
      const url = new URL(info.req.url || '', `http://${info.req.headers.host}`);
      const token = url.searchParams.get('token') || 
                   info.req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn('WebSocket connection rejected: No authentication token');
        return false;
      }

      // Verify JWT token
      jwt.verify(token, this.jwtSecret);
      return true;
    } catch (error) {
      this.logger.warn('WebSocket connection rejected: Invalid token');
      return false;
    }
  }

  /**
   * Setup WebSocket server event handlers
   */
  private setupServer(): void {
    this.server.on('connection', (socket: WebSocket, request: IncomingMessage) => {
      this.handleConnection(socket, request);
    });

    this.server.on('error', (error) => {
      this.logger.error('WebSocket server error:', error);
      this.emit('server_error', error);
    });

    this.server.on('listening', () => {
      this.logger.info('WebSocket server listening');
      this.emit('server_listening');
    });
  }

  /**
   * Handle new client connection
   */
  private handleConnection(socket: WebSocket, request: IncomingMessage): void {
    const clientId = this.generateClientId();
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const token = url.searchParams.get('token') || 
                 request.headers.authorization?.replace('Bearer ', '');

    let userId: string | null = null;
    let userRole: string | null = null;

    try {
      if (token) {
        const payload = jwt.verify(token, this.jwtSecret) as any;
        userId = payload.userId || payload.sub;
        userRole = payload.role || 'user';
      }
    } catch (error) {
      this.logger.warn(`Failed to decode JWT for client ${clientId}`);
    }

    const client: WebSocketClient = {
      id: clientId,
      userId,
      userRole,
      socket,
      isAuthenticated: !!userId,
      connectedAt: new Date(),
      lastActivity: new Date(),
      subscriptions: new Set(),
      metadata: {
        ip: request.socket.remoteAddress,
        userAgent: request.headers['user-agent']
      }
    };

    this.clients.set(clientId, client);
    
    this.logger.info(`Client connected: ${clientId} ${userId ? `(user: ${userId})` : '(anonymous)'}`);

    // Setup client event handlers
    socket.on('message', (data: Buffer) => {
      this.handleMessage(clientId, data);
    });

    socket.on('close', (code: number, reason: Buffer) => {
      this.handleDisconnection(clientId, code, reason);
    });

    socket.on('error', (error: Error) => {
      this.logger.error(`Client ${clientId} error:`, error);
      this.handleClientError(clientId, error);
    });

    socket.on('pong', () => {
      client.lastActivity = new Date();
    });

    // Send welcome message
    this.sendToClient(clientId, {
      type: 'welcome',
      timestamp: new Date().toISOString(),
      data: {
        clientId,
        userId,
        isAuthenticated: client.isAuthenticated,
        serverTime: new Date().toISOString()
      }
    });

    this.emit('client_connected', client);
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(clientId: string, data: Buffer): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastActivity = new Date();

    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      message.userId = client.userId || undefined;
      
      this.logger.debug(`Message from ${clientId}: ${message.type}`);
      
      // Handle system messages
      switch (message.type) {
        case 'ping':
          this.sendToClient(clientId, {
            type: 'pong',
            timestamp: new Date().toISOString(),
            data: { timestamp: message.data?.timestamp },
            requestId: message.requestId
          });
          break;

        case 'subscribe':
          this.handleSubscribe(clientId, message);
          break;

        case 'unsubscribe':
          this.handleUnsubscribe(clientId, message);
          break;

        case 'join_room':
          this.handleJoinRoom(clientId, message);
          break;

        case 'leave_room':
          this.handleLeaveRoom(clientId, message);
          break;

        case 'broadcast':
          this.handleBroadcast(clientId, message);
          break;

        default:
          // Emit for application-specific handling
          this.emit('message', clientId, message);
          break;
      }
    } catch (error) {
      this.logger.error(`Error parsing message from ${clientId}:`, error);
      this.sendError(clientId, 'Invalid message format');
    }
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(clientId: string, code: number, reason: Buffer): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    this.logger.info(`Client disconnected: ${clientId} (code: ${code})`);

    // Remove from rooms
    for (const [roomId, room] of this.rooms) {
      if (room.clients.has(clientId)) {
        room.clients.delete(clientId);
        this.broadcastToRoom(roomId, {
          type: 'user_left',
          timestamp: new Date().toISOString(),
          data: { userId: client.userId, clientId }
        });
      }
    }

    this.clients.delete(clientId);
    this.emit('client_disconnected', client, code);
  }

  /**
   * Handle client error
   */
  private handleClientError(clientId: string, error: Error): void {
    this.logger.error(`Client ${clientId} error:`, error);
    this.emit('client_error', clientId, error);
  }

  /**
   * Handle subscription request
   */
  private handleSubscribe(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { channel } = message.data;
    if (typeof channel === 'string') {
      client.subscriptions.add(channel);
      this.sendToClient(clientId, {
        type: 'subscribed',
        timestamp: new Date().toISOString(),
        data: { channel },
        requestId: message.requestId
      });
      
      this.logger.debug(`Client ${clientId} subscribed to ${channel}`);
      this.emit('client_subscribed', clientId, channel);
    }
  }

  /**
   * Handle unsubscription request
   */
  private handleUnsubscribe(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { channel } = message.data;
    if (typeof channel === 'string') {
      client.subscriptions.delete(channel);
      this.sendToClient(clientId, {
        type: 'unsubscribed',
        timestamp: new Date().toISOString(),
        data: { channel },
        requestId: message.requestId
      });
      
      this.logger.debug(`Client ${clientId} unsubscribed from ${channel}`);
      this.emit('client_unsubscribed', clientId, channel);
    }
  }

  /**
   * Handle join room request
   */
  private handleJoinRoom(clientId: string, message: WebSocketMessage): void {
    const { roomId, roomName } = message.data;
    if (typeof roomId !== 'string') return;

    // Create room if it doesn't exist
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        name: roomName || roomId,
        clients: new Set(),
        metadata: {}
      });
    }

    const room = this.rooms.get(roomId)!;
    room.clients.add(clientId);

    const client = this.clients.get(clientId);
    if (client) {
      this.sendToClient(clientId, {
        type: 'room_joined',
        timestamp: new Date().toISOString(),
        data: { roomId, roomName: room.name },
        requestId: message.requestId
      });

      // Notify other room members
      this.broadcastToRoom(roomId, {
        type: 'user_joined',
        timestamp: new Date().toISOString(),
        data: { userId: client.userId, clientId }
      }, [clientId]);

      this.logger.debug(`Client ${clientId} joined room ${roomId}`);
      this.emit('client_joined_room', clientId, roomId);
    }
  }

  /**
   * Handle leave room request
   */
  private handleLeaveRoom(clientId: string, message: WebSocketMessage): void {
    const { roomId } = message.data;
    const room = this.rooms.get(roomId);
    
    if (room && room.clients.has(clientId)) {
      room.clients.delete(clientId);

      const client = this.clients.get(clientId);
      if (client) {
        this.sendToClient(clientId, {
          type: 'room_left',
          timestamp: new Date().toISOString(),
          data: { roomId },
          requestId: message.requestId
        });

        // Notify other room members
        this.broadcastToRoom(roomId, {
          type: 'user_left',
          timestamp: new Date().toISOString(),
          data: { userId: client.userId, clientId }
        });

        this.logger.debug(`Client ${clientId} left room ${roomId}`);
        this.emit('client_left_room', clientId, roomId);
      }

      // Clean up empty room
      if (room.clients.size === 0) {
        this.rooms.delete(roomId);
        this.logger.debug(`Removed empty room ${roomId}`);
      }
    }
  }

  /**
   * Handle broadcast request
   */
  private handleBroadcast(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId);
    if (!client || !client.isAuthenticated) {
      this.sendError(clientId, 'Authentication required for broadcasting');
      return;
    }

    const { channel, data } = message.data;
    if (typeof channel === 'string') {
      this.broadcastToChannel(channel, {
        type: 'broadcast',
        timestamp: new Date().toISOString(),
        data: {
          channel,
          message: data,
          from: client.userId
        }
      }, [clientId]);
    }
  }

  /**
   * Send message to specific client
   */
  private sendToClient(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId);
    if (client && client.socket.readyState === WebSocket.OPEN) {
      try {
        client.socket.send(JSON.stringify(message));
      } catch (error) {
        this.logger.error(`Error sending to client ${clientId}:`, error);
      }
    }
  }

  /**
   * Send error message to client
   */
  private sendError(clientId: string, error: string, requestId?: string): void {
    this.sendToClient(clientId, {
      type: 'error',
      timestamp: new Date().toISOString(),
      data: { error },
      requestId
    });
  }

  /**
   * Broadcast message to all clients in a channel (subscription-based)
   */
  public broadcastToChannel(channel: string, message: WebSocketMessage, exclude: string[] = []): void {
    let sentCount = 0;
    
    for (const [clientId, client] of this.clients) {
      if (exclude.includes(clientId)) continue;
      if (!client.subscriptions.has(channel)) continue;
      
      if (client.socket.readyState === WebSocket.OPEN) {
        try {
          client.socket.send(JSON.stringify(message));
          sentCount++;
        } catch (error) {
          this.logger.error(`Error broadcasting to client ${clientId}:`, error);
        }
      }
    }

    this.logger.debug(`Broadcast to channel ${channel}: ${sentCount} clients`);
  }

  /**
   * Broadcast message to all clients in a room
   */
  public broadcastToRoom(roomId: string, message: WebSocketMessage, exclude: string[] = []): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    let sentCount = 0;

    for (const clientId of room.clients) {
      if (exclude.includes(clientId)) continue;
      
      const client = this.clients.get(clientId);
      if (client && client.socket.readyState === WebSocket.OPEN) {
        try {
          client.socket.send(JSON.stringify(message));
          sentCount++;
        } catch (error) {
          this.logger.error(`Error broadcasting to client ${clientId}:`, error);
        }
      }
    }

    this.logger.debug(`Broadcast to room ${roomId}: ${sentCount} clients`);
  }

  /**
   * Broadcast to all connected clients
   */
  public broadcastToAll(message: WebSocketMessage, exclude: string[] = []): void {
    let sentCount = 0;
    
    for (const [clientId, client] of this.clients) {
      if (exclude.includes(clientId)) continue;
      
      if (client.socket.readyState === WebSocket.OPEN) {
        try {
          client.socket.send(JSON.stringify(message));
          sentCount++;
        } catch (error) {
          this.logger.error(`Error broadcasting to client ${clientId}:`, error);
        }
      }
    }

    this.logger.debug(`Broadcast to all: ${sentCount} clients`);
  }

  /**
   * Send message to specific user (all their connections)
   */
  public sendToUser(userId: string, message: WebSocketMessage): void {
    let sentCount = 0;
    
    for (const [clientId, client] of this.clients) {
      if (client.userId !== userId) continue;
      
      if (client.socket.readyState === WebSocket.OPEN) {
        try {
          client.socket.send(JSON.stringify(message));
          sentCount++;
        } catch (error) {
          this.logger.error(`Error sending to user ${userId} (client ${clientId}):`, error);
        }
      }
    }

    this.logger.debug(`Sent to user ${userId}: ${sentCount} connections`);
  }

  /**
   * Get connected clients
   */
  public getClients(): WebSocketClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Get client by ID
   */
  public getClient(clientId: string): WebSocketClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Get clients by user ID
   */
  public getClientsByUser(userId: string): WebSocketClient[] {
    return Array.from(this.clients.values()).filter(client => client.userId === userId);
  }

  /**
   * Get room information
   */
  public getRoom(roomId: string): WebSocketRoom | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get all rooms
   */
  public getRooms(): WebSocketRoom[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Get server statistics
   */
  public getStats() {
    return {
      connectedClients: this.clients.size,
      authenticatedClients: Array.from(this.clients.values()).filter(c => c.isAuthenticated).length,
      activeRooms: this.rooms.size,
      totalSubscriptions: Array.from(this.clients.values()).reduce((sum, c) => sum + c.subscriptions.size, 0),
      uptime: process.uptime()
    };
  }

  /**
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const [clientId, client] of this.clients) {
        if (client.socket.readyState === WebSocket.OPEN) {
          client.socket.ping();
        }
      }
    }, 30000); // 30 seconds
  }

  /**
   * Start cleanup of stale connections
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = 5 * 60 * 1000; // 5 minutes

      for (const [clientId, client] of this.clients) {
        if (now - client.lastActivity.getTime() > staleThreshold) {
          this.logger.info(`Cleaning up stale client: ${clientId}`);
          client.socket.terminate();
          this.clients.delete(clientId);
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Shutdown the WebSocket service
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down WebSocket service');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Close all client connections
    for (const [clientId, client] of this.clients) {
      client.socket.close(1001, 'Server shutdown');
    }

    // Close server
    return new Promise((resolve) => {
      this.server.close(() => {
        this.logger.info('WebSocket server closed');
        resolve();
      });
    });
  }
}
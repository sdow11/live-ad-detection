/**
 * WebSocket Service Interface
 * 
 * Defines the contract for real-time communication infrastructure
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
  socket: any; // WebSocket type
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

export interface WebSocketStats {
  connectedClients: number;
  authenticatedClients: number;
  activeRooms: number;
  totalSubscriptions: number;
  uptime: number;
}

export interface IWebSocketService {
  /**
   * Broadcast message to all clients subscribed to a channel
   * @param channel Channel name
   * @param message Message to broadcast
   * @param exclude Client IDs to exclude
   */
  broadcastToChannel(channel: string, message: WebSocketMessage, exclude?: string[]): void;

  /**
   * Broadcast message to all clients in a room
   * @param roomId Room identifier
   * @param message Message to broadcast
   * @param exclude Client IDs to exclude
   */
  broadcastToRoom(roomId: string, message: WebSocketMessage, exclude?: string[]): void;

  /**
   * Broadcast message to all connected clients
   * @param message Message to broadcast
   * @param exclude Client IDs to exclude
   */
  broadcastToAll(message: WebSocketMessage, exclude?: string[]): void;

  /**
   * Send message to specific user (all their connections)
   * @param userId User identifier
   * @param message Message to send
   */
  sendToUser(userId: string, message: WebSocketMessage): void;

  /**
   * Get all connected clients
   * @returns Array of connected clients
   */
  getClients(): WebSocketClient[];

  /**
   * Get client by ID
   * @param clientId Client identifier
   * @returns Client or undefined
   */
  getClient(clientId: string): WebSocketClient | undefined;

  /**
   * Get clients by user ID
   * @param userId User identifier
   * @returns Array of clients for the user
   */
  getClientsByUser(userId: string): WebSocketClient[];

  /**
   * Get room information
   * @param roomId Room identifier
   * @returns Room or undefined
   */
  getRoom(roomId: string): WebSocketRoom | undefined;

  /**
   * Get all rooms
   * @returns Array of all rooms
   */
  getRooms(): WebSocketRoom[];

  /**
   * Get server statistics
   * @returns Current server statistics
   */
  getStats(): WebSocketStats;

  /**
   * Shutdown the WebSocket service
   */
  shutdown(): Promise<void>;

  // Event emitter interface
  on(event: 'client_connected', listener: (client: WebSocketClient) => void): this;
  on(event: 'client_disconnected', listener: (client: WebSocketClient, code: number) => void): this;
  on(event: 'client_error', listener: (clientId: string, error: Error) => void): this;
  on(event: 'message', listener: (clientId: string, message: WebSocketMessage) => void): this;
  on(event: 'client_subscribed', listener: (clientId: string, channel: string) => void): this;
  on(event: 'client_unsubscribed', listener: (clientId: string, channel: string) => void): this;
  on(event: 'client_joined_room', listener: (clientId: string, roomId: string) => void): this;
  on(event: 'client_left_room', listener: (clientId: string, roomId: string) => void): this;
  on(event: 'server_error', listener: (error: Error) => void): this;
  on(event: 'server_listening', listener: () => void): this;
  
  emit(event: string | symbol, ...args: any[]): boolean;
  removeAllListeners(event?: string | symbol): this;
}
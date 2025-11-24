'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * WebSocket Hook
 * 
 * Manages WebSocket connections for real-time communication
 * Handles authentication, reconnection, and subscription management
 * Supports both Linux and Android platforms
 */

interface WebSocketMessage {
  type: string;
  timestamp: string;
  data: any;
  requestId?: string;
  userId?: string;
}

interface UseWebSocketOptions {
  reconnectAttempts?: number;
  reconnectDelay?: number;
  heartbeatInterval?: number;
  debug?: boolean;
}

interface UseWebSocketReturn {
  socket: WebSocket | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  lastMessage: WebSocketMessage | null;
  sendMessage: (message: WebSocketMessage) => boolean;
  subscribe: (channel: string) => void;
  unsubscribe: (channel: string) => void;
  reconnect: () => void;
}

const DEFAULT_OPTIONS: UseWebSocketOptions = {
  reconnectAttempts: 5,
  reconnectDelay: 3000,
  heartbeatInterval: 30000,
  debug: false
};

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  
  const reconnectAttempts = useRef(0);
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);
  const subscriptions = useRef<Set<string>>(new Set());
  const messageQueue = useRef<WebSocketMessage[]>([]);

  // Get WebSocket URL
  const getWebSocketUrl = useCallback(() => {
    if (typeof window === 'undefined') return '';
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const port = process.env.NODE_ENV === 'development' ? '3001' : window.location.port;
    
    return `${protocol}//${host}${port ? `:${port}` : ''}/ws`;
  }, []);

  // Send message
  const sendMessage = useCallback((message: WebSocketMessage): boolean => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      // Queue message for when connection is restored
      messageQueue.current.push(message);
      if (opts.debug) {
        console.log('WebSocket: Message queued (not connected)', message);
      }
      return false;
    }

    try {
      socket.send(JSON.stringify(message));
      if (opts.debug) {
        console.log('WebSocket: Message sent', message);
      }
      return true;
    } catch (error) {
      console.error('WebSocket: Failed to send message', error);
      setError('Failed to send message');
      return false;
    }
  }, [socket, opts.debug]);

  // Subscribe to channel
  const subscribe = useCallback((channel: string) => {
    subscriptions.current.add(channel);
    
    const message: WebSocketMessage = {
      type: 'subscribe',
      timestamp: new Date().toISOString(),
      data: { channel }
    };
    
    sendMessage(message);
  }, [sendMessage]);

  // Unsubscribe from channel
  const unsubscribe = useCallback((channel: string) => {
    subscriptions.current.delete(channel);
    
    const message: WebSocketMessage = {
      type: 'unsubscribe',
      timestamp: new Date().toISOString(),
      data: { channel }
    };
    
    sendMessage(message);
  }, [sendMessage]);

  // Setup heartbeat
  const setupHeartbeat = useCallback((ws: WebSocket) => {
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
    }

    heartbeatInterval.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const heartbeat: WebSocketMessage = {
          type: 'ping',
          timestamp: new Date().toISOString(),
          data: {}
        };
        
        try {
          ws.send(JSON.stringify(heartbeat));
        } catch (error) {
          console.error('WebSocket: Heartbeat failed', error);
        }
      }
    }, opts.heartbeatInterval);
  }, [opts.heartbeatInterval]);

  // Process queued messages
  const processMessageQueue = useCallback(() => {
    while (messageQueue.current.length > 0) {
      const message = messageQueue.current.shift();
      if (message) {
        sendMessage(message);
      }
    }
  }, [sendMessage]);

  // Re-subscribe to channels
  const resubscribeChannels = useCallback(() => {
    subscriptions.current.forEach(channel => {
      const message: WebSocketMessage = {
        type: 'subscribe',
        timestamp: new Date().toISOString(),
        data: { channel }
      };
      sendMessage(message);
    });
  }, [sendMessage]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (isConnecting || (socket && socket.readyState === WebSocket.OPEN)) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const wsUrl = getWebSocketUrl();
      if (!wsUrl) {
        throw new Error('Unable to determine WebSocket URL');
      }

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (opts.debug) {
          console.log('WebSocket: Connected');
        }
        
        setSocket(ws);
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectAttempts.current = 0;
        
        setupHeartbeat(ws);
        
        // Authenticate if token is available
        const token = localStorage.getItem('authToken');
        if (token) {
          const authMessage: WebSocketMessage = {
            type: 'authenticate',
            timestamp: new Date().toISOString(),
            data: { token }
          };
          ws.send(JSON.stringify(authMessage));
        }
        
        // Re-subscribe to channels and process queued messages
        setTimeout(() => {
          resubscribeChannels();
          processMessageQueue();
        }, 100);
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(message);
          
          if (opts.debug) {
            console.log('WebSocket: Message received', message);
          }
          
          // Handle special message types
          switch (message.type) {
            case 'pong':
              // Heartbeat response
              break;
            case 'error':
              setError(message.data.message || 'Server error');
              break;
            case 'authenticated':
              if (opts.debug) {
                console.log('WebSocket: Authentication successful');
              }
              break;
          }
        } catch (error) {
          console.error('WebSocket: Failed to parse message', error);
        }
      };

      ws.onclose = (event) => {
        if (opts.debug) {
          console.log('WebSocket: Disconnected', event.code, event.reason);
        }
        
        setSocket(null);
        setIsConnected(false);
        setIsConnecting(false);
        
        if (heartbeatInterval.current) {
          clearInterval(heartbeatInterval.current);
          heartbeatInterval.current = null;
        }

        // Attempt reconnection if not a manual disconnect
        if (event.code !== 1000 && reconnectAttempts.current < opts.reconnectAttempts!) {
          setError(`Connection lost. Reconnecting... (${reconnectAttempts.current + 1}/${opts.reconnectAttempts})`);
          reconnectAttempts.current++;
          
          setTimeout(() => {
            connect();
          }, opts.reconnectDelay);
        } else if (reconnectAttempts.current >= opts.reconnectAttempts!) {
          setError('Connection failed. Maximum reconnection attempts reached.');
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket: Connection error', error);
        setError('Connection error occurred');
        setIsConnecting(false);
      };

    } catch (error) {
      console.error('WebSocket: Failed to connect', error);
      setError('Failed to establish connection');
      setIsConnecting(false);
    }
  }, [isConnecting, socket, getWebSocketUrl, opts, setupHeartbeat, resubscribeChannels, processMessageQueue]);

  // Manual reconnect
  const reconnect = useCallback(() => {
    if (socket) {
      socket.close();
    }
    reconnectAttempts.current = 0;
    setError(null);
    connect();
  }, [socket, connect]);

  // Initialize connection
  useEffect(() => {
    connect();

    return () => {
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
      }
      if (socket) {
        socket.close();
      }
    };
  }, []);

  // Auto-subscribe to default channels
  useEffect(() => {
    if (isConnected) {
      // Subscribe to essential channels
      subscribe('notifications');
      subscribe('pip_events');
      subscribe('ad_detection');
      subscribe('live_updates');
    }
  }, [isConnected, subscribe]);

  return {
    socket,
    isConnected,
    isConnecting,
    error,
    lastMessage,
    sendMessage,
    subscribe,
    unsubscribe,
    reconnect
  };
}

// Hook for debugging WebSocket connection
export function useWebSocketDebug() {
  const wsState = useWebSocket({ debug: true });
  
  useEffect(() => {
    console.log('WebSocket Debug State:', {
      connected: wsState.isConnected,
      connecting: wsState.isConnecting,
      error: wsState.error,
      lastMessage: wsState.lastMessage
    });
  }, [wsState]);
  
  return wsState;
}
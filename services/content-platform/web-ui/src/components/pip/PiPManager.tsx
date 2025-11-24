'use client';

import { useState, useEffect, useCallback } from 'react';
import { PictureInPicturePlayer } from './PictureInPicturePlayer';
import { useWebSocket } from '@/hooks/useWebSocket';

/**
 * PiP Manager Component
 * 
 * Manages multiple Picture-in-Picture sessions
 * Handles real-time ad detection triggers and manual PiP activation
 * Supports both Linux and Android responsive layouts
 */

interface PiPSession {
  id: string;
  contentId: string;
  contentUrl: string;
  contentType: 'video' | 'image' | 'stream';
  title: string;
  triggerReason: string;
  startedAt: string;
  isActive: boolean;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface PiPManagerProps {
  maxSessions?: number;
  autoCloseAfter?: number; // minutes
}

export function PiPManager({ maxSessions = 3, autoCloseAfter = 30 }: PiPManagerProps) {
  const [sessions, setSessions] = useState<PiPSession[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  // WebSocket connection for real-time updates
  const { socket, isConnected } = useWebSocket();

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Subscribe to WebSocket events
  useEffect(() => {
    if (!socket || !isConnected) return;

    // Subscribe to PiP events
    socket.send(JSON.stringify({
      type: 'subscribe',
      data: { channel: 'pip_events' }
    }));

    // Subscribe to ad detection events
    socket.send(JSON.stringify({
      type: 'subscribe',
      data: { channel: 'ad_detection' }
    }));

    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'pip_triggered':
            handlePiPTriggered(message.data);
            break;
          case 'pip_ended':
            handlePiPEnded(message.data);
            break;
          case 'ad_detected':
            handleAdDetected(message.data);
            break;
          case 'live_update':
            if (message.data.type === 'pip_triggered') {
              handlePiPTriggered(message.data.data);
            }
            break;
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    socket.addEventListener('message', handleMessage);

    return () => {
      socket.removeEventListener('message', handleMessage);
    };
  }, [socket, isConnected]);

  // Handle PiP triggered event
  const handlePiPTriggered = useCallback(async (data: any) => {
    const { sessionId, contentId, reason } = data;
    
    try {
      // Fetch content details
      const response = await fetch(`/api/v1/content/${contentId}`);
      if (!response.ok) {
        console.error('Failed to fetch content details');
        return;
      }
      
      const contentData = await response.json();
      const content = contentData.data;

      // Calculate position for new session
      const position = calculateSessionPosition(sessions.length);
      
      const newSession: PiPSession = {
        id: sessionId,
        contentId,
        contentUrl: content.url || content.filePath,
        contentType: content.contentType === 'video' ? 'video' : 'image',
        title: content.title,
        triggerReason: reason,
        startedAt: new Date().toISOString(),
        isActive: true,
        position
      };

      setSessions(prev => {
        // Remove oldest session if at max capacity
        let updatedSessions = prev;
        if (prev.length >= maxSessions) {
          updatedSessions = prev.slice(1); // Remove oldest
        }
        
        return [...updatedSessions, newSession];
      });

      console.log(`PiP session started: ${sessionId} for content: ${content.title}`);
    } catch (error) {
      console.error('Error handling PiP trigger:', error);
    }
  }, [sessions.length, maxSessions]);

  // Handle PiP ended event
  const handlePiPEnded = useCallback((data: any) => {
    const { sessionId } = data;
    
    setSessions(prev => prev.filter(session => session.id !== sessionId));
    console.log(`PiP session ended: ${sessionId}`);
  }, []);

  // Handle ad detection event (for manual triggers)
  const handleAdDetected = useCallback((detection: any) => {
    console.log('Ad detected:', detection);
    // The backend will automatically trigger PiP if configured
    // This is just for logging/analytics
  }, []);

  // Calculate position for new PiP session
  const calculateSessionPosition = (sessionIndex: number) => {
    const defaultWidth = isMobile ? 240 : 320;
    const defaultHeight = isMobile ? 135 : 180;
    const margin = 10;
    
    if (isMobile) {
      // Stack vertically on mobile
      return {
        x: margin,
        y: 80 + (sessionIndex * (defaultHeight + margin)),
        width: defaultWidth,
        height: defaultHeight
      };
    } else {
      // Offset diagonally on desktop
      const baseX = window.innerWidth - defaultWidth - margin;
      const baseY = margin;
      
      return {
        x: baseX - (sessionIndex * 30),
        y: baseY + (sessionIndex * 30),
        width: defaultWidth,
        height: defaultHeight
      };
    }
  };

  // Handle session position change
  const handlePositionChange = useCallback((sessionId: string, position: any) => {
    setSessions(prev =>
      prev.map(session =>
        session.id === sessionId ? { ...session, position } : session
      )
    );

    // Update position on server
    fetch(`/api/v1/pip/sessions/${sessionId}/position`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(position)
    }).catch(error => {
      console.error('Failed to update PiP position:', error);
    });
  }, []);

  // Handle session close
  const handleSessionClose = useCallback(async (sessionId: string) => {
    try {
      // End session on server
      const response = await fetch(`/api/v1/pip/sessions/${sessionId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setSessions(prev => prev.filter(session => session.id !== sessionId));
      }
    } catch (error) {
      console.error('Failed to end PiP session:', error);
      // Remove from local state anyway
      setSessions(prev => prev.filter(session => session.id !== sessionId));
    }
  }, []);

  // Auto-close sessions after timeout
  useEffect(() => {
    if (autoCloseAfter <= 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const timeoutMs = autoCloseAfter * 60 * 1000;

      setSessions(prev => {
        const activeSessions = prev.filter(session => {
          const startTime = new Date(session.startedAt).getTime();
          const isExpired = now - startTime > timeoutMs;
          
          if (isExpired) {
            // End session on server
            fetch(`/api/v1/pip/sessions/${session.id}`, {
              method: 'DELETE'
            }).catch(error => {
              console.error('Failed to end expired PiP session:', error);
            });
          }
          
          return !isExpired;
        });

        return activeSessions;
      });
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [autoCloseAfter]);

  // Manual PiP trigger function (for testing or manual activation)
  const triggerManualPiP = useCallback(async (contentId: string, reason: string = 'Manual trigger') => {
    try {
      const response = await fetch('/api/v1/pip/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentId, reason })
      });

      if (!response.ok) {
        throw new Error('Failed to trigger PiP');
      }

      console.log('Manual PiP triggered for content:', contentId);
    } catch (error) {
      console.error('Error triggering manual PiP:', error);
    }
  }, []);

  // Expose triggerManualPiP for external use
  useEffect(() => {
    (window as any).triggerPiP = triggerManualPiP;
    return () => {
      delete (window as any).triggerPiP;
    };
  }, [triggerManualPiP]);

  return (
    <>
      {sessions.map((session) => (
        <PictureInPicturePlayer
          key={session.id}
          isVisible={session.isActive}
          contentUrl={session.contentUrl}
          contentType={session.contentType}
          title={session.title}
          sessionId={session.id}
          onClose={() => handleSessionClose(session.id)}
          onPositionChange={(position) => handlePositionChange(session.id, position)}
          initialPosition={session.position}
          autoPlay={true}
          showControls={true}
          triggeredBy={session.triggerReason}
        />
      ))}

      {/* Development Helper (only in dev mode) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 left-4 bg-black/80 text-white p-2 rounded text-xs">
          PiP Sessions: {sessions.length} | Connected: {isConnected ? '✓' : '✗'}
        </div>
      )}
    </>
  );
}

// Hook for external components to trigger PiP
export const usePiPManager = () => {
  const triggerPiP = useCallback((contentId: string, reason?: string) => {
    const trigger = (window as any).triggerPiP;
    if (trigger) {
      trigger(contentId, reason);
    } else {
      console.error('PiP Manager not available');
    }
  }, []);

  return { triggerPiP };
};
'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  X, 
  Maximize2, 
  Minimize2, 
  Volume2, 
  VolumeX, 
  Play, 
  Pause, 
  Move,
  RotateCcw
} from 'lucide-react';

/**
 * Picture-in-Picture Player Component
 * 
 * Displays content in a draggable, resizable overlay window
 * Automatically triggered by ad detection or manual activation
 * Supports both Linux desktop and Android mobile layouts
 */

interface PiPPlayerProps {
  isVisible: boolean;
  contentUrl: string;
  contentType: 'video' | 'image' | 'stream';
  title: string;
  sessionId: string;
  onClose: () => void;
  onPositionChange?: (position: { x: number; y: number; width: number; height: number }) => void;
  initialPosition?: { x: number; y: number; width: number; height: number };
  autoPlay?: boolean;
  showControls?: boolean;
  triggeredBy?: string;
}

export function PictureInPicturePlayer({
  isVisible,
  contentUrl,
  contentType,
  title,
  sessionId,
  onClose,
  onPositionChange,
  initialPosition,
  autoPlay = true,
  showControls = true,
  triggeredBy
}: PiPPlayerProps) {
  const [position, setPosition] = useState(initialPosition || {
    x: window.innerWidth - 340,
    y: 20,
    width: 320,
    height: 180
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showHoverControls, setShowHoverControls] = useState(false);

  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Make component draggable and responsive for mobile
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    // Adjust position for mobile
    if (isMobile) {
      setPosition({
        x: 10,
        y: 80,
        width: Math.min(280, window.innerWidth - 40),
        height: 158
      });
    }
  }, [isMobile]);

  useEffect(() => {
    if (onPositionChange) {
      onPositionChange(position);
    }
  }, [position, onPositionChange]);

  // Handle mouse/touch events for dragging
  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (isExpanded) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    setIsDragging(true);
    setDragStart({
      x: clientX - position.x,
      y: clientY - position.y
    });
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const newX = Math.max(0, Math.min(window.innerWidth - position.width, clientX - dragStart.x));
    const newY = Math.max(0, Math.min(window.innerHeight - position.height, clientY - dragStart.y));
    
    setPosition(prev => ({ ...prev, x: newX, y: newY }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
  };

  // Setup global mouse/touch event listeners
  useEffect(() => {
    if (isDragging || isResizing) {
      const moveHandler = (e: MouseEvent | TouchEvent) => handleMouseMove(e);
      const upHandler = () => handleMouseUp();

      document.addEventListener('mousemove', moveHandler);
      document.addEventListener('mouseup', upHandler);
      document.addEventListener('touchmove', moveHandler);
      document.addEventListener('touchend', upHandler);

      return () => {
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('mouseup', upHandler);
        document.removeEventListener('touchmove', moveHandler);
        document.removeEventListener('touchend', upHandler);
      };
    }
  }, [isDragging, isResizing, dragStart, position]);

  const handleExpand = () => {
    if (isExpanded) {
      // Return to PiP mode
      setPosition(prev => ({
        x: window.innerWidth - 340,
        y: 20,
        width: 320,
        height: 180
      }));
    } else {
      // Expand to larger overlay
      setPosition({
        x: Math.max(0, (window.innerWidth - 640) / 2),
        y: Math.max(0, (window.innerHeight - 360) / 2),
        width: Math.min(640, window.innerWidth - 40),
        height: Math.min(360, window.innerHeight - 80)
      });
    }
    setIsExpanded(!isExpanded);
  };

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const renderContent = () => {
    switch (contentType) {
      case 'video':
        return (
          <video
            ref={videoRef}
            src={contentUrl}
            autoPlay={autoPlay}
            muted={isMuted}
            loop
            className="w-full h-full object-cover"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onLoadStart={() => setIsPlaying(autoPlay)}
          />
        );
      case 'image':
        return (
          <img
            ref={imageRef}
            src={contentUrl}
            alt={title}
            className="w-full h-full object-cover"
          />
        );
      case 'stream':
        return (
          <iframe
            src={contentUrl}
            className="w-full h-full border-0"
            allow="autoplay; encrypted-media"
          />
        );
      default:
        return (
          <div className="w-full h-full flex items-center justify-center bg-gray-800 text-white">
            <span>Unsupported content type</span>
          </div>
        );
    }
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Backdrop for expanded mode */}
      {isExpanded && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsExpanded(false)}
        />
      )}

      {/* PiP Player */}
      <div
        ref={playerRef}
        className={`fixed z-50 bg-black rounded-lg shadow-2xl overflow-hidden transition-all duration-300 ${
          isDragging ? 'cursor-move' : 'cursor-default'
        } ${isExpanded ? 'shadow-3xl' : ''}`}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${position.width}px`,
          height: `${position.height}px`,
          transform: isDragging ? 'scale(1.02)' : 'scale(1)'
        }}
        onMouseEnter={() => setShowHoverControls(true)}
        onMouseLeave={() => setShowHoverControls(false)}
      >
        {/* Content */}
        <div className="relative w-full h-full">
          {renderContent()}

          {/* Triggered By Badge */}
          {triggeredBy && (
            <div className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
              {triggeredBy}
            </div>
          )}

          {/* Drag Handle (Mobile) */}
          {isMobile && (
            <div
              className="absolute top-0 left-0 w-full h-8 bg-gradient-to-b from-black/50 to-transparent cursor-move flex items-center justify-center"
              onTouchStart={handleMouseDown}
            >
              <Move className="w-4 h-4 text-white/70" />
            </div>
          )}

          {/* Controls Overlay */}
          {(showControls && (showHoverControls || isMobile || isExpanded)) && (
            <div className="absolute inset-0 bg-black/30 transition-opacity duration-200">
              {/* Top Controls */}
              <div className="absolute top-2 right-2 flex space-x-1">
                {!isMobile && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="bg-black/50 text-white hover:bg-black/70 p-1 h-auto"
                    onClick={handleExpand}
                  >
                    {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="bg-black/50 text-white hover:bg-black/70 p-1 h-auto"
                  onClick={onClose}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>

              {/* Center Play/Pause for large overlay */}
              {isExpanded && contentType === 'video' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Button
                    variant="ghost"
                    className="bg-black/50 text-white hover:bg-black/70 p-4 rounded-full"
                    onClick={handlePlayPause}
                  >
                    {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8" />}
                  </Button>
                </div>
              )}

              {/* Bottom Controls */}
              <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center">
                <div className="flex space-x-1">
                  {contentType === 'video' && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="bg-black/50 text-white hover:bg-black/70 p-1 h-auto"
                        onClick={handlePlayPause}
                      >
                        {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="bg-black/50 text-white hover:bg-black/70 p-1 h-auto"
                        onClick={handleMute}
                      >
                        {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                      </Button>
                    </>
                  )}
                </div>
                
                {/* Title */}
                <div className="bg-black/50 text-white text-xs px-2 py-1 rounded max-w-32 truncate">
                  {title}
                </div>
              </div>
            </div>
          )}

          {/* Drag Handle (Desktop) */}
          {!isMobile && !isExpanded && (
            <div
              className="absolute top-0 left-0 w-full h-full cursor-move"
              onMouseDown={handleMouseDown}
            />
          )}
        </div>
      </div>

      {/* Mobile-specific positioning help */}
      {isMobile && isDragging && (
        <div className="fixed top-4 left-4 right-4 bg-black/80 text-white text-center text-sm py-2 rounded z-60">
          Drag to reposition • Release to place
        </div>
      )}
    </>
  );
}
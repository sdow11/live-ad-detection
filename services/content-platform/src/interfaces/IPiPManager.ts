import { Position, Size, ReplacementContent } from './ISmartPiPAutomationService';

// Dependency Inversion Principle: Abstract interface for PiP management
export interface IPiPManager {
  // Core PiP operations
  activatePiP(options: PiPActivationOptions): Promise<void>;
  deactivatePiP(streamId: string): Promise<void>;

  // Position and size management
  updatePiPPosition(options: PiPPositionOptions): Promise<void>;
  updatePiPSize(options: PiPSizeOptions): Promise<void>;
  updatePiPContent(options: PiPContentOptions): Promise<void>;

  // State queries
  getPiPStatus(streamId: string): Promise<PiPStatus>;
  isPiPActive(streamId?: string): boolean;

  // Visual effects
  setPiPOpacity(streamId: string, opacity: number): Promise<void>;
  minimizePiP(streamId: string): Promise<void>;
  restorePiP(streamId: string): Promise<void>;
}

export interface PiPActivationOptions {
  streamId: string;
  position: Position;
  size: Size;
  content: ReplacementContent | null;
  opacity?: number;
  zIndex?: number;
}

export interface PiPPositionOptions {
  streamId: string;
  position: Position;
  animate?: boolean;
  duration?: number;
}

export interface PiPSizeOptions {
  streamId: string;
  size: Size;
  animate?: boolean;
  duration?: number;
}

export interface PiPContentOptions {
  streamId: string;
  content: ReplacementContent;
  transitionType?: 'fade' | 'slide' | 'instant';
  transitionDuration?: number;
}

export interface PiPStatus {
  isActive: boolean;
  streamId: string;
  position: Position;
  size: Size;
  opacity: number;
  isMinimized: boolean;
  content: ReplacementContent | null;
  createdAt: Date;
  lastUpdated: Date;
}
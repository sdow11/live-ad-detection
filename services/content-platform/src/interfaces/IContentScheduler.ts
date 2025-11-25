import { ReplacementContent, ContentMetadata } from './ISmartPiPAutomationService';

// Dependency Inversion Principle: Abstract interface for content scheduling
export interface IContentScheduler {
  // Content retrieval
  getReplacementContent(criteria: ContentCriteria): Promise<ReplacementContent | null>;
  getContentForTimeSlot(timeSlot: TimeSlot): Promise<ReplacementContent[]>;
  getContentMetadata(contentId: string): Promise<ContentMetadata | null>;

  // Content management
  scheduleContent(schedule: ContentSchedule): Promise<void>;
  updateContentSchedule(scheduleId: string, updates: Partial<ContentSchedule>): Promise<void>;

  // Performance optimization
  preloadContent(options: PreloadOptions): Promise<void>;
  validateContentAvailability(contentId: string): Promise<boolean>;
}

export interface ContentCriteria {
  duration: number;
  preferredCategories: string[];
  excludeCategories: string[];
  quality: string;
  language?: string;
  maxAge?: number; // Content age in days
  minRating?: number;
}

export interface TimeSlot {
  startTime: Date;
  endTime: Date;
  streamId: string;
  category?: string;
}

export interface ContentSchedule {
  id?: string;
  streamId: string;
  contentId: string;
  scheduledTime: Date;
  duration: number;
  priority: number;
  metadata?: any;
}

export interface PreloadOptions {
  streamId: string;
  expectedDuration: number;
  quality: string;
  count?: number; // Number of content items to preload
}
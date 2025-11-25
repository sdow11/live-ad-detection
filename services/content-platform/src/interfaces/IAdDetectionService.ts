import { AdDetection } from './ISmartPiPAutomationService';

// Dependency Inversion Principle: Abstract interface for ad detection service
export interface IAdDetectionService {
  // Event subscription
  subscribeToDetections(callback: (detection: AdDetection) => void): Promise<void>;
  unsubscribeFromDetections(): Promise<void>;

  // Detection queries
  getCurrentDetection(streamId: string): Promise<AdDetection | null>;
  getDetectionHistory(streamId: string, limit?: number): Promise<AdDetection[]>;

  // Validation and confidence
  validateDetection(detection: AdDetection): Promise<boolean>;
  getDetectionConfidence(detection: AdDetection): Promise<number>;
}
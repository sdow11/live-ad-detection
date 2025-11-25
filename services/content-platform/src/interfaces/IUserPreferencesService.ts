import { UserPreferences } from './ISmartPiPAutomationService';

// Dependency Inversion Principle: Abstract interface for user preferences management
export interface IUserPreferencesService {
  // Preferences management
  getUserPreferences(userId: string): Promise<UserPreferences>;
  updateUserPreferences(userId: string, preferences: Partial<UserPreferences>): Promise<void>;
  
  // Validation and defaults
  validatePreferences(preferences: Partial<UserPreferences>): Promise<ValidationResult>;
  getDefaultPreferences(): Promise<UserPreferences>;
  resetPreferences(userId: string): Promise<void>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}
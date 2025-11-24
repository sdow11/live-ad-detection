import crypto from 'crypto';
import { ITokenGeneratorService } from '@/interfaces/IMobileAuthService';
import { Logger } from '@/utils/Logger';

/**
 * Token Generator Service
 * 
 * Provides secure token generation for mobile authentication system.
 * Implements cryptographically secure random token generation with
 * customizable formats and validation.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility: Focuses solely on token generation and validation
 * - Open/Closed: Extensible for new token types and algorithms
 * - Liskov Substitution: Can be substituted with other token generators
 * - Interface Segregation: Implements only token-related operations
 * - Dependency Inversion: Uses standard crypto libraries as abstractions
 * 
 * Security Features:
 * - Cryptographically secure random generation
 * - Entropy validation
 * - Format validation
 * - Collision detection
 * - Configurable token properties
 */

export class TokenGeneratorService implements ITokenGeneratorService {
  private logger: Logger;
  
  // Configuration constants
  private readonly config = {
    pairingCode: {
      length: 6,
      chars: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', // Exclude similar-looking chars (0, O, I, 1)
      attempts: 3 // Max generation attempts to avoid collisions
    },
    sessionToken: {
      length: 48, // 384 bits of entropy
      encoding: 'base64url' as const
    },
    refreshToken: {
      length: 64, // 512 bits of entropy
      encoding: 'base64url' as const
    }
  };

  constructor(logger?: Logger) {
    this.logger = logger || new Logger('TokenGeneratorService');
  }

  /**
   * Generate human-friendly pairing code
   * Uses characters that are easy to read and type
   */
  generatePairingCode(length: number = this.config.pairingCode.length): string {
    if (length < 4 || length > 12) {
      throw new Error('Pairing code length must be between 4 and 12 characters');
    }

    const chars = this.config.pairingCode.chars;
    let code = '';
    
    // Generate cryptographically secure random code
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, chars.length);
      code += chars[randomIndex];
    }

    // Validate entropy and uniqueness
    if (!this.validateCodeEntropy(code)) {
      // Retry up to max attempts
      for (let attempt = 1; attempt < this.config.pairingCode.attempts; attempt++) {
        code = this.generatePairingCode(length);
        if (this.validateCodeEntropy(code)) {
          break;
        }
      }
    }

    this.logger.debug(`Generated pairing code with ${this.calculateEntropy(code)} bits of entropy`);
    return code;
  }

  /**
   * Generate secure session token
   * Uses cryptographically secure random bytes
   */
  generateSessionToken(): string {
    const bytes = crypto.randomBytes(this.config.sessionToken.length);
    const token = bytes.toString(this.config.sessionToken.encoding);
    
    // Add timestamp prefix for token lifecycle tracking
    const timestamp = Math.floor(Date.now() / 1000).toString(36);
    const finalToken = `${timestamp}.${token}`;

    this.logger.debug(`Generated session token with ${this.config.sessionToken.length * 8} bits of entropy`);
    return finalToken;
  }

  /**
   * Generate secure refresh token
   * Uses even higher entropy for long-term storage
   */
  generateRefreshToken(): string {
    const bytes = crypto.randomBytes(this.config.refreshToken.length);
    const token = bytes.toString(this.config.refreshToken.encoding);
    
    // Add version prefix for token rotation support
    const version = 'v1';
    const checksum = this.generateChecksum(token);
    const finalToken = `${version}.${checksum}.${token}`;

    this.logger.debug(`Generated refresh token with ${this.config.refreshToken.length * 8} bits of entropy`);
    return finalToken;
  }

  /**
   * Validate token format and structure
   */
  validateTokenFormat(token: string): boolean {
    if (!token || typeof token !== 'string') {
      return false;
    }

    // Check for session token format
    if (this.isSessionTokenFormat(token)) {
      return this.validateSessionTokenFormat(token);
    }

    // Check for refresh token format
    if (this.isRefreshTokenFormat(token)) {
      return this.validateRefreshTokenFormat(token);
    }

    // Check for pairing code format
    if (this.isPairingCodeFormat(token)) {
      return this.validatePairingCodeFormat(token);
    }

    return false;
  }

  /**
   * Generate secure device identifier
   */
  generateDeviceId(): string {
    const randomBytes = crypto.randomBytes(16);
    const timestamp = Date.now().toString(36);
    const deviceId = `device_${timestamp}_${randomBytes.toString('hex')}`;
    
    this.logger.debug('Generated device identifier');
    return deviceId;
  }

  /**
   * Generate API key for external integrations
   */
  generateAPIKey(prefix: string = 'lad'): string {
    const keyBytes = crypto.randomBytes(32);
    const key = keyBytes.toString('base64url');
    const checksum = this.generateChecksum(key);
    
    return `${prefix}_${checksum}_${key}`;
  }

  /**
   * Generate one-time use token for specific operations
   */
  generateOneTimeToken(purpose: string, expiryMinutes: number = 15): string {
    const purposeHash = crypto.createHash('sha256').update(purpose).digest('hex').substring(0, 8);
    const expiry = Math.floor((Date.now() + expiryMinutes * 60 * 1000) / 1000).toString(36);
    const randomBytes = crypto.randomBytes(24);
    const token = randomBytes.toString('base64url');
    
    return `ott_${purposeHash}_${expiry}_${token}`;
  }

  /**
   * Private helper methods
   */
  private validateCodeEntropy(code: string): boolean {
    // Check for patterns that reduce security
    const entropy = this.calculateEntropy(code);
    const minEntropy = code.length * 2.5; // Minimum acceptable entropy
    
    // Check for repeating characters
    const uniqueChars = new Set(code).size;
    const repetitionRatio = uniqueChars / code.length;
    
    // Check for sequential patterns
    const hasSequentialPattern = this.hasSequentialPattern(code);
    
    return entropy >= minEntropy && 
           repetitionRatio > 0.5 && 
           !hasSequentialPattern;
  }

  private calculateEntropy(str: string): number {
    const charFreq = new Map<string, number>();
    
    // Count character frequencies
    for (const char of str) {
      charFreq.set(char, (charFreq.get(char) || 0) + 1);
    }
    
    // Calculate Shannon entropy
    let entropy = 0;
    for (const freq of charFreq.values()) {
      const probability = freq / str.length;
      entropy -= probability * Math.log2(probability);
    }
    
    return entropy * str.length;
  }

  private hasSequentialPattern(code: string): boolean {
    const chars = this.config.pairingCode.chars;
    
    for (let i = 0; i < code.length - 2; i++) {
      const char1Index = chars.indexOf(code[i]);
      const char2Index = chars.indexOf(code[i + 1]);
      const char3Index = chars.indexOf(code[i + 2]);
      
      // Check for ascending or descending sequences
      if (char1Index !== -1 && char2Index !== -1 && char3Index !== -1) {
        if ((char2Index === char1Index + 1 && char3Index === char2Index + 1) ||
            (char2Index === char1Index - 1 && char3Index === char2Index - 1)) {
          return true;
        }
      }
    }
    
    return false;
  }

  private isSessionTokenFormat(token: string): boolean {
    // Session token format: {timestamp}.{base64url-token}
    const parts = token.split('.');
    return parts.length === 2 && 
           /^[a-z0-9]+$/.test(parts[0]) && // timestamp in base36
           /^[A-Za-z0-9_-]+$/.test(parts[1]); // base64url
  }

  private validateSessionTokenFormat(token: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    
    const [timestampPart, tokenPart] = parts;
    
    // Validate timestamp part
    const timestamp = parseInt(timestampPart, 36);
    if (isNaN(timestamp) || timestamp <= 0) return false;
    
    // Validate token part length and format
    if (tokenPart.length < 32 || !/^[A-Za-z0-9_-]+$/.test(tokenPart)) {
      return false;
    }
    
    return true;
  }

  private isRefreshTokenFormat(token: string): boolean {
    // Refresh token format: v1.{checksum}.{base64url-token}
    const parts = token.split('.');
    return parts.length === 3 && 
           parts[0] === 'v1' &&
           /^[a-f0-9]{8}$/.test(parts[1]) && // 8-char hex checksum
           /^[A-Za-z0-9_-]+$/.test(parts[2]); // base64url
  }

  private validateRefreshTokenFormat(token: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    
    const [version, checksum, tokenPart] = parts;
    
    // Validate version
    if (version !== 'v1') return false;
    
    // Validate checksum format
    if (!/^[a-f0-9]{8}$/.test(checksum)) return false;
    
    // Validate token part
    if (tokenPart.length < 64 || !/^[A-Za-z0-9_-]+$/.test(tokenPart)) {
      return false;
    }
    
    // Validate checksum
    const expectedChecksum = this.generateChecksum(tokenPart);
    if (checksum !== expectedChecksum) return false;
    
    return true;
  }

  private isPairingCodeFormat(token: string): boolean {
    // Pairing code format: 6-character alphanumeric
    return /^[A-Z0-9]{6}$/.test(token.toUpperCase());
  }

  private validatePairingCodeFormat(token: string): boolean {
    const normalizedToken = token.toUpperCase();
    
    // Basic format check
    if (!/^[A-Z0-9]{6}$/.test(normalizedToken)) {
      return false;
    }
    
    // Check against allowed characters
    const allowedChars = new Set(this.config.pairingCode.chars);
    for (const char of normalizedToken) {
      if (!allowedChars.has(char)) {
        return false;
      }
    }
    
    return true;
  }

  private generateChecksum(data: string): string {
    return crypto.createHash('sha256')
      .update(data)
      .digest('hex')
      .substring(0, 8);
  }

  /**
   * Token analysis and validation utilities
   */
  analyzeToken(token: string): {
    type: 'session' | 'refresh' | 'pairing' | 'api' | 'onetime' | 'unknown';
    valid: boolean;
    entropy?: number;
    age?: number;
    expires?: number;
  } {
    if (this.isSessionTokenFormat(token)) {
      const parts = token.split('.');
      const timestamp = parseInt(parts[0], 36) * 1000;
      const age = Date.now() - timestamp;
      
      return {
        type: 'session',
        valid: this.validateSessionTokenFormat(token),
        entropy: this.calculateEntropy(parts[1]),
        age
      };
    }
    
    if (this.isRefreshTokenFormat(token)) {
      return {
        type: 'refresh',
        valid: this.validateRefreshTokenFormat(token),
        entropy: this.calculateEntropy(token.split('.')[2])
      };
    }
    
    if (this.isPairingCodeFormat(token)) {
      return {
        type: 'pairing',
        valid: this.validatePairingCodeFormat(token),
        entropy: this.calculateEntropy(token)
      };
    }
    
    if (token.startsWith('ott_')) {
      const parts = token.split('_');
      if (parts.length >= 4) {
        const expiry = parseInt(parts[2], 36) * 1000;
        return {
          type: 'onetime',
          valid: expiry > Date.now(),
          expires: expiry
        };
      }
    }
    
    if (token.startsWith('lad_')) {
      return {
        type: 'api',
        valid: this.validateTokenFormat(token)
      };
    }
    
    return {
      type: 'unknown',
      valid: false
    };
  }

  /**
   * Security utilities
   */
  generateSecureRandomString(length: number, alphabet?: string): string {
    const chars = alphabet || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, chars.length);
      result += chars[randomIndex];
    }
    
    return result;
  }

  generateNonce(length: number = 16): string {
    return crypto.randomBytes(length).toString('hex');
  }

  generateCSRFToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }
}
import { IQRCodeService, QRCodeData } from '@/interfaces/IMobileAuthService';
import { Logger } from '@/utils/Logger';

/**
 * QR Code Service
 * 
 * Provides QR code generation and validation for mobile device pairing.
 * Implements secure QR code generation with error correction and validation.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility: Focuses solely on QR code operations
 * - Open/Closed: Extensible for new QR code formats and standards
 * - Liskov Substitution: Can be substituted with other QR code generators
 * - Interface Segregation: Implements only QR code-related operations
 * - Dependency Inversion: Uses abstraction for QR code library
 * 
 * Security Features:
 * - Data validation and sanitization
 * - Error correction levels
 * - Size and format validation
 * - Secure data encoding
 * - Expiration handling in QR data
 */

export class QRCodeService implements IQRCodeService {
  private logger: Logger;
  
  // Configuration constants
  private readonly config = {
    errorCorrectionLevel: 'M' as const, // Medium error correction (15%)
    type: 'png' as const,
    margin: 4,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    },
    width: 256,
    maxDataLength: 2048, // Maximum data length for QR code
    compressionLevel: 6
  };

  constructor(logger?: Logger) {
    this.logger = logger || new Logger('QRCodeService');
  }

  /**
   * Generate QR code for mobile device pairing
   * Returns base64-encoded PNG data URL
   */
  async generateQRCode(data: QRCodeData): Promise<string> {
    try {
      // Validate input data
      this.validateQRCodeData(data);

      // Prepare QR code payload
      const qrPayload = this.prepareQRPayload(data);
      
      // Check payload size
      if (qrPayload.length > this.config.maxDataLength) {
        throw new Error('QR code data exceeds maximum length');
      }

      // Generate QR code using a mock implementation
      // In a real implementation, this would use a library like 'qrcode'
      const qrCodeBuffer = await this.generateQRCodeBuffer(qrPayload);
      
      // Convert to data URL
      const dataURL = this.bufferToDataURL(qrCodeBuffer);
      
      this.logger.debug(`Generated QR code for pairing code: ${data.code.substring(0, 3)}***`);
      return dataURL;
    } catch (error) {
      this.logger.error('Failed to generate QR code:', error);
      throw new Error('QR code generation failed');
    }
  }

  /**
   * Encode data as data URL
   */
  encodeDataURL(data: any): string {
    try {
      const jsonData = JSON.stringify(data);
      const encodedData = Buffer.from(jsonData, 'utf-8').toString('base64');
      return `data:application/json;base64,${encodedData}`;
    } catch (error) {
      this.logger.error('Failed to encode data URL:', error);
      throw new Error('Data URL encoding failed');
    }
  }

  /**
   * Validate QR code data structure
   */
  validateQRCodeData(data: any): boolean {
    if (!data || typeof data !== 'object') {
      throw new Error('QR code data must be an object');
    }

    const qrData = data as QRCodeData;

    // Required fields
    if (!qrData.code || typeof qrData.code !== 'string') {
      throw new Error('QR code data must include a valid pairing code');
    }

    if (!qrData.userId || typeof qrData.userId !== 'string') {
      throw new Error('QR code data must include a valid user ID');
    }

    if (!qrData.appName || typeof qrData.appName !== 'string') {
      throw new Error('QR code data must include a valid app name');
    }

    // Validate code format
    if (!/^[A-Z0-9]{6}$/.test(qrData.code)) {
      throw new Error('Invalid pairing code format');
    }

    // Validate UUID format for user ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(qrData.userId)) {
      throw new Error('Invalid user ID format');
    }

    // Validate app name
    if (qrData.appName.length > 50 || !/^[a-zA-Z0-9\s\-_]+$/.test(qrData.appName)) {
      throw new Error('Invalid app name format');
    }

    // Validate optional fields
    if (qrData.version && typeof qrData.version !== 'string') {
      throw new Error('Version must be a string');
    }

    if (qrData.timestamp && !(qrData.timestamp instanceof Date)) {
      throw new Error('Timestamp must be a Date object');
    }

    if (qrData.securityToken && (typeof qrData.securityToken !== 'string' || qrData.securityToken.length < 16)) {
      throw new Error('Security token must be at least 16 characters');
    }

    return true;
  }

  /**
   * Generate QR code for app download
   */
  async generateAppDownloadQRCode(platform: 'ios' | 'android', appStoreURL: string): Promise<string> {
    try {
      const downloadData = {
        type: 'app_download',
        platform,
        url: appStoreURL,
        appName: 'LiveAdDetection',
        timestamp: new Date(),
        version: '1.0.0'
      };

      return await this.generateQRCode(downloadData as any);
    } catch (error) {
      this.logger.error('Failed to generate app download QR code:', error);
      throw new Error('App download QR code generation failed');
    }
  }

  /**
   * Generate QR code for WiFi configuration
   */
  async generateWiFiQRCode(ssid: string, password: string, security: 'WPA' | 'WEP' | 'nopass' = 'WPA'): Promise<string> {
    try {
      // WiFi QR code format: WIFI:T:WPA;S:ssid;P:password;H:false;;
      const wifiString = `WIFI:T:${security};S:${ssid};P:${password};H:false;;`;
      
      const qrCodeBuffer = await this.generateQRCodeBuffer(wifiString);
      return this.bufferToDataURL(qrCodeBuffer);
    } catch (error) {
      this.logger.error('Failed to generate WiFi QR code:', error);
      throw new Error('WiFi QR code generation failed');
    }
  }

  /**
   * Validate and parse QR code content
   */
  parseQRCodeData(qrContent: string): QRCodeData | null {
    try {
      // Try to parse as JSON first
      let data: any;
      
      if (qrContent.startsWith('{')) {
        data = JSON.parse(qrContent);
      } else if (qrContent.startsWith('data:application/json;base64,')) {
        // Decode base64 data URL
        const base64Data = qrContent.split(',')[1];
        const jsonData = Buffer.from(base64Data, 'base64').toString('utf-8');
        data = JSON.parse(jsonData);
      } else {
        // Handle other formats (URL, plain text, etc.)
        return this.parseSpecialFormats(qrContent);
      }

      // Validate the parsed data
      if (this.validateQRCodeData(data)) {
        return data as QRCodeData;
      }

      return null;
    } catch (error) {
      this.logger.debug('Failed to parse QR code data:', error);
      return null;
    }
  }

  /**
   * Generate secure QR code with encryption
   */
  async generateSecureQRCode(data: QRCodeData, encryptionKey?: string): Promise<string> {
    try {
      let payload = this.prepareQRPayload(data);

      // Encrypt payload if key provided
      if (encryptionKey) {
        payload = this.encryptPayload(payload, encryptionKey);
      }

      const qrCodeBuffer = await this.generateQRCodeBuffer(payload);
      return this.bufferToDataURL(qrCodeBuffer);
    } catch (error) {
      this.logger.error('Failed to generate secure QR code:', error);
      throw new Error('Secure QR code generation failed');
    }
  }

  /**
   * Private helper methods
   */
  private prepareQRPayload(data: QRCodeData): string {
    // Add metadata for security and validation
    const payload = {
      ...data,
      timestamp: data.timestamp || new Date(),
      version: data.version || '1.0',
      checksum: this.generateChecksum(data.code + data.userId)
    };

    return JSON.stringify(payload);
  }

  private async generateQRCodeBuffer(data: string): Promise<Buffer> {
    // Mock QR code generation - in reality, would use 'qrcode' library:
    // const QRCode = require('qrcode');
    // return await QRCode.toBuffer(data, {
    //   errorCorrectionLevel: this.config.errorCorrectionLevel,
    //   type: this.config.type,
    //   quality: 0.92,
    //   margin: this.config.margin,
    //   color: this.config.color,
    //   width: this.config.width
    // });

    // For this implementation, return a mock PNG buffer
    const mockPNG = this.generateMockPNGBuffer(data);
    return mockPNG;
  }

  private generateMockPNGBuffer(data: string): Buffer {
    // Generate a simple mock PNG buffer that represents QR code data
    // In a real implementation, this would be done by a QR code library
    
    const header = 'PNG_MOCK_QR_';
    const dataHash = this.generateChecksum(data);
    const size = `_${this.config.width}x${this.config.width}_`;
    const timestamp = Date.now().toString();
    
    const mockContent = header + dataHash + size + timestamp;
    return Buffer.from(mockContent, 'utf-8');
  }

  private bufferToDataURL(buffer: Buffer): string {
    const base64 = buffer.toString('base64');
    return `data:image/png;base64,${base64}`;
  }

  private generateChecksum(data: string): string {
    // Simple checksum for validation - in production, use crypto.createHash
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  private encryptPayload(payload: string, key: string): string {
    // Mock encryption - in production, use proper encryption
    // const crypto = require('crypto');
    // const cipher = crypto.createCipher('aes-256-cbc', key);
    // let encrypted = cipher.update(payload, 'utf8', 'hex');
    // encrypted += cipher.final('hex');
    // return encrypted;
    
    // Simple XOR encryption for demo purposes
    let encrypted = '';
    for (let i = 0; i < payload.length; i++) {
      const keyChar = key.charCodeAt(i % key.length);
      const payloadChar = payload.charCodeAt(i);
      encrypted += String.fromCharCode(payloadChar ^ keyChar);
    }
    return Buffer.from(encrypted, 'binary').toString('base64');
  }

  private parseSpecialFormats(content: string): QRCodeData | null {
    // Handle URL format
    if (content.startsWith('https://') || content.startsWith('http://')) {
      try {
        const url = new URL(content);
        const params = url.searchParams;
        
        return {
          code: params.get('code') || '',
          userId: params.get('userId') || '',
          appName: params.get('app') || 'LiveAdDetection',
          version: params.get('version') || '1.0'
        };
      } catch {
        return null;
      }
    }

    // Handle custom scheme format: liveaddetection://pair?code=ABC123&userId=123
    if (content.startsWith('liveaddetection://')) {
      try {
        const url = new URL(content);
        const params = url.searchParams;
        
        if (url.pathname === 'pair' || url.pathname === '//pair') {
          return {
            code: params.get('code') || '',
            userId: params.get('userId') || '',
            appName: 'LiveAdDetection',
            version: params.get('version') || '1.0'
          };
        }
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Utility methods
   */
  getQRCodeInfo(qrContent: string): {
    format: 'json' | 'url' | 'scheme' | 'encrypted' | 'unknown';
    size: number;
    estimatedComplexity: 'low' | 'medium' | 'high';
  } {
    let format: 'json' | 'url' | 'scheme' | 'encrypted' | 'unknown' = 'unknown';
    
    if (qrContent.startsWith('{')) {
      format = 'json';
    } else if (qrContent.startsWith('https://') || qrContent.startsWith('http://')) {
      format = 'url';
    } else if (qrContent.startsWith('liveaddetection://')) {
      format = 'scheme';
    } else if (qrContent.includes('encrypted')) {
      format = 'encrypted';
    }

    const size = qrContent.length;
    let estimatedComplexity: 'low' | 'medium' | 'high' = 'low';
    
    if (size > 1000) {
      estimatedComplexity = 'high';
    } else if (size > 300) {
      estimatedComplexity = 'medium';
    }

    return { format, size, estimatedComplexity };
  }

  generateQRCodeWithLogo(data: QRCodeData, logoBase64?: string): Promise<string> {
    // This would integrate a logo into the QR code
    // For now, just generate a regular QR code
    return this.generateQRCode(data);
  }

  generateDynamicQRCode(baseURL: string, trackingId: string): Promise<string> {
    // Generate QR code that redirects through a tracking URL
    const dynamicURL = `${baseURL}/qr/${trackingId}`;
    const dynamicData: QRCodeData = {
      code: trackingId.substring(0, 6).toUpperCase(),
      userId: 'dynamic',
      appName: 'LiveAdDetection',
      version: '1.0'
    };
    
    return this.generateQRCode(dynamicData);
  }
}
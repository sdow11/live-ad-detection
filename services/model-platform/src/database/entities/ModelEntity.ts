import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { ModelType, MLFramework, ModelCapability } from '@/interfaces/IModelRepository';

/**
 * Model Entity for Database Persistence
 * 
 * Represents AI model metadata in the database with optimized indexes
 * and constraints for the Live Ad Detection system
 */
@Entity('models')
@Index(['name', 'version'], { unique: true })
@Index(['modelType'])
@Index(['framework'])
@Index(['capabilities'])
@Index(['tags'])
@Index(['createdAt'])
export class ModelEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 50 })
  version!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    default: ModelType.OBJECT_DETECTION,
  })
  modelType!: ModelType;

  @Column({
    type: 'varchar',
    length: 50,
    default: MLFramework.TENSORFLOW,
  })
  framework!: MLFramework;

  @Column({ type: 'bigint' })
  fileSize!: number;

  @Column({ type: 'varchar', length: 64 })
  checksum!: string;

  @Column({ type: 'varchar', length: 2048 })
  downloadUrl!: string;

  @Column({ type: 'simple-array' })
  tags!: string[];

  @Column({ type: 'varchar', length: 50, nullable: true })
  minFrameworkVersion?: string | null;

  @Column({ type: 'boolean', default: false })
  requiredGPU!: boolean;

  @Column({
    type: 'simple-array',
    transformer: {
      to: (value: ModelCapability[]) => value,
      from: (value: string | string[]) => {
        if (Array.isArray(value)) return value as ModelCapability[];
        return value ? value.split(',') as ModelCapability[] : [];
      },
    },
  })
  capabilities!: ModelCapability[];

  // Metadata as JSON for cross-database compatibility
  @Column({ type: 'simple-json', nullable: true })
  metadata!: Record<string, any>;

  // Download and usage statistics
  @Column({ type: 'integer', default: 0 })
  downloadCount!: number;

  @Column({ type: 'datetime', nullable: true })
  lastDownloadedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastUsedAt?: Date | null;

  // Status and availability
  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'boolean', default: true })
  isPublic!: boolean;

  // Version management
  @Column({ type: 'boolean', default: false })
  isLatest!: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  parentModelId?: string | null;

  // File validation status
  @Column({ type: 'boolean', default: false })
  isValidated!: boolean;

  @Column({ type: 'datetime', nullable: true })
  validatedAt?: Date | null;

  @Column({ type: 'simple-json', nullable: true })
  validationResults?: Record<string, any> | null;

  // Timestamps with automatic timezone handling
  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date | null;

  // Entity lifecycle hooks
  @BeforeInsert()
  @BeforeUpdate()
  validateEntity(): void {
    // Ensure file size is positive
    if (this.fileSize <= 0) {
      throw new Error('File size must be positive');
    }

    // Ensure checksum format
    if (!/^[a-fA-F0-9]{64}$/.test(this.checksum)) {
      throw new Error('Invalid checksum format (expected SHA256)');
    }

    // Ensure version follows semver-like format
    if (!/^\d+\.\d+(\.\d+)?(-[\w\-\.]*)?$/.test(this.version)) {
      throw new Error('Invalid version format');
    }

    // Ensure capabilities are valid
    if (!Array.isArray(this.capabilities) || this.capabilities.length === 0) {
      throw new Error('At least one capability must be specified');
    }

    // Normalize tags
    if (this.tags) {
      this.tags = this.tags.map(tag => tag.toLowerCase().trim()).filter(Boolean);
    }

    // Set defaults
    if (this.downloadCount === undefined) {
      this.downloadCount = 0;
    }

    if (this.metadata === undefined || this.metadata === null) {
      this.metadata = {};
    }
  }

  /**
   * Get formatted file size
   */
  getFormattedFileSize(): string {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (this.fileSize === 0) return '0 B';
    
    const i = Math.floor(Math.log(this.fileSize) / Math.log(1024));
    return `${(this.fileSize / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }

  /**
   * Check if model is compatible with platform
   */
  isCompatibleWith(platform: string): boolean {
    // Basic compatibility check based on framework and platform
    const platformCompatibility: Record<string, MLFramework[]> = {
      android: [MLFramework.TENSORFLOW, MLFramework.ONNX],
      ios: [MLFramework.TENSORFLOW, MLFramework.ONNX],
      'raspberry-pi': [MLFramework.TENSORFLOW, MLFramework.ONNX],
      web: [MLFramework.TENSORFLOW, MLFramework.ONNX],
    };

    const compatibleFrameworks = platformCompatibility[platform.toLowerCase()] || [];
    return compatibleFrameworks.includes(this.framework);
  }

  /**
   * Get model age in days
   */
  getAgeInDays(): number {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - this.createdAt.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if model needs update (based on age or download activity)
   */
  needsUpdate(): boolean {
    const ageInDays = this.getAgeInDays();
    const hasRecentActivity = this.lastUsedAt && 
      (Date.now() - this.lastUsedAt.getTime()) < (7 * 24 * 60 * 60 * 1000); // 7 days

    // Consider update if model is old and not recently used
    return ageInDays > 90 && !hasRecentActivity;
  }

  /**
   * Update usage statistics
   */
  recordUsage(): void {
    this.lastUsedAt = new Date();
    this.downloadCount += 1;
  }

  /**
   * Create model summary for API responses
   */
  toSummary(): Record<string, any> {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      modelType: this.modelType,
      framework: this.framework,
      formattedFileSize: this.getFormattedFileSize(),
      capabilities: this.capabilities,
      tags: this.tags,
      isLatest: this.isLatest,
      downloadCount: this.downloadCount,
      createdAt: this.createdAt,
    };
  }

  /**
   * Create full model details for API responses
   */
  toDetail(): Record<string, any> {
    return {
      ...this.toSummary(),
      description: this.description,
      fileSize: this.fileSize,
      checksum: this.checksum,
      downloadUrl: this.downloadUrl,
      minFrameworkVersion: this.minFrameworkVersion,
      requiredGPU: this.requiredGPU,
      metadata: this.metadata,
      isActive: this.isActive,
      isPublic: this.isPublic,
      isValidated: this.isValidated,
      validatedAt: this.validatedAt,
      lastDownloadedAt: this.lastDownloadedAt,
      lastUsedAt: this.lastUsedAt,
      updatedAt: this.updatedAt,
    };
  }
}
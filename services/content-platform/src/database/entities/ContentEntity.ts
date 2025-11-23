import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  Check,
} from 'typeorm';
import { ContentType, ContentStatus, ContentMetadata } from '@/models/Content';

/**
 * Content Database Entity
 * 
 * Single Responsibility: Database representation of Content
 * Maps directly to PostgreSQL table structure
 */
@Entity('contents')
@Index(['userId', 'status'])
@Index(['contentType', 'status'])
@Index(['createdAt'])
@Check(`"fileSize" > 0`)
@Check(`"title" != ''`)
export class ContentEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  userId: string;

  @Column('varchar', { length: 255 })
  fileName: string;

  @Column('varchar', { length: 255 })
  originalFileName: string;

  @Column('varchar', { length: 100 })
  mimeType: string;

  @Column('bigint')
  fileSize: number;

  @Column('text')
  filePath: string;

  @Column('text', { nullable: true })
  thumbnailPath: string | null;

  @Column('varchar', { length: 255 })
  title: string;

  @Column('text', { nullable: true })
  description: string | null;

  @Column('simple-array', { default: '' })
  tags: string[];

  @Column('enum', { enum: ContentType })
  @Index()
  contentType: ContentType;

  @Column('int', { nullable: true })
  duration: number | null; // seconds for video content

  @Column('int', { nullable: true })
  width: number | null;

  @Column('int', { nullable: true })
  height: number | null;

  @Column('jsonb', { default: {} })
  metadata: ContentMetadata;

  @Column('enum', { enum: ContentStatus, default: ContentStatus.PROCESSING })
  @Index()
  status: ContentStatus;

  @Column('boolean', { default: false })
  @Index()
  isPublic: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  // Virtual properties for business logic
  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  get isReady(): boolean {
    return this.status === ContentStatus.READY;
  }

  get isProcessing(): boolean {
    return this.status === ContentStatus.PROCESSING;
  }

  getFormattedFileSize(): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = this.fileSize;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  getFormattedDuration(): string | null {
    if (!this.duration) return null;

    const hours = Math.floor(this.duration / 3600);
    const minutes = Math.floor((this.duration % 3600) / 60);
    const seconds = Math.floor(this.duration % 60);

    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
}
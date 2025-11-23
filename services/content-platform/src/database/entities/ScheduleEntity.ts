import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  ManyToOne, 
  JoinColumn, 
  CreateDateColumn, 
  UpdateDateColumn,
  Index
} from 'typeorm';
import { ContentEntity } from './ContentEntity';

/**
 * Schedule Entity
 * 
 * Represents content scheduling configuration in the database
 * Follows PostgreSQL best practices with proper indexing
 */
@Entity('schedules')
@Index(['userId', 'isActive'])
@Index(['nextExecutionAt', 'isActive'])
@Index(['contentId'])
export class ScheduleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: false })
  @Index()
  userId!: string;

  @Column({ type: 'uuid', nullable: false })
  contentId!: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  @Index()
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'timestamp with time zone', nullable: false })
  @Index()
  startDate!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  endDate?: Date;

  @Column({ type: 'varchar', length: 100, nullable: false })
  cronExpression!: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  timezone!: string;

  @Column({ type: 'boolean', default: true })
  @Index()
  isActive!: boolean;

  @Column({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, any>;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastExecutedAt?: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  @Index()
  nextExecutionAt?: Date;

  @Column({ type: 'int', default: 0 })
  executionCount!: number;

  @Column({ type: 'int', default: 0 })
  failureCount!: number;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;

  // Relations
  @ManyToOne(() => ContentEntity, { nullable: false })
  @JoinColumn({ name: 'contentId' })
  content!: ContentEntity;
}

/**
 * Schedule Execution Log Entity
 * 
 * Tracks execution history for schedules
 */
@Entity('schedule_executions')
@Index(['scheduleId', 'executedAt'])
@Index(['executedAt'])
export class ScheduleExecutionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: false })
  @Index()
  scheduleId!: string;

  @Column({ type: 'uuid', nullable: false })
  contentId!: string;

  @Column({ type: 'timestamp with time zone', nullable: false })
  @Index()
  executedAt!: Date;

  @Column({ type: 'boolean', nullable: false })
  success!: boolean;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ type: 'int', nullable: true })
  duration?: number;

  @Column({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, any>;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  // Relations
  @ManyToOne(() => ScheduleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scheduleId' })
  schedule!: ScheduleEntity;

  @ManyToOne(() => ContentEntity)
  @JoinColumn({ name: 'contentId' })
  content!: ContentEntity;
}
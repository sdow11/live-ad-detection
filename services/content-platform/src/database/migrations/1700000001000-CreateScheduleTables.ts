import { MigrationInterface, QueryRunner, Table, Index, ForeignKey } from 'typeorm';

/**
 * Create Schedule Tables Migration
 * 
 * Creates schedules and schedule_executions tables with proper indexing and constraints
 * Follows PostgreSQL best practices for performance and data integrity
 */
export class CreateScheduleTables1700000001000 implements MigrationInterface {
  name = 'CreateScheduleTables1700000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the schedules table
    await queryRunner.createTable(
      new Table({
        name: 'schedules',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'contentId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'startDate',
            type: 'timestamp with time zone',
            isNullable: false,
          },
          {
            name: 'endDate',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'cronExpression',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'timezone',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            default: "'{}'::jsonb",
            isNullable: false,
          },
          {
            name: 'lastExecutedAt',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'nextExecutionAt',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'executionCount',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'failureCount',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updatedAt',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
        checks: [
          {
            name: 'CHK_schedules_endDate_after_startDate',
            expression: '"endDate" IS NULL OR "endDate" > "startDate"',
          },
          {
            name: 'CHK_schedules_name_not_empty',
            expression: 'LENGTH(TRIM("name")) > 0',
          },
          {
            name: 'CHK_schedules_cronExpression_not_empty',
            expression: 'LENGTH(TRIM("cronExpression")) > 0',
          },
          {
            name: 'CHK_schedules_timezone_not_empty',
            expression: 'LENGTH(TRIM("timezone")) > 0',
          },
        ],
      }),
      true
    );

    // Create the schedule_executions table
    await queryRunner.createTable(
      new Table({
        name: 'schedule_executions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'scheduleId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'contentId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'executedAt',
            type: 'timestamp with time zone',
            isNullable: false,
          },
          {
            name: 'success',
            type: 'boolean',
            isNullable: false,
          },
          {
            name: 'error',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'duration',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            default: "'{}'::jsonb",
            isNullable: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
        checks: [
          {
            name: 'CHK_schedule_executions_duration_positive',
            expression: '"duration" IS NULL OR "duration" > 0',
          },
        ],
      }),
      true
    );

    // Create indexes for schedules table
    await queryRunner.query(`
      CREATE INDEX "IDX_schedules_userId_isActive" ON "schedules" ("userId", "isActive")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_schedules_nextExecutionAt_isActive" ON "schedules" ("nextExecutionAt", "isActive")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_schedules_contentId" ON "schedules" ("contentId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_schedules_name" ON "schedules" ("name")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_schedules_startDate" ON "schedules" ("startDate")
    `);

    // Create indexes for schedule_executions table
    await queryRunner.query(`
      CREATE INDEX "IDX_schedule_executions_scheduleId_executedAt" ON "schedule_executions" ("scheduleId", "executedAt" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_schedule_executions_executedAt" ON "schedule_executions" ("executedAt" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_schedule_executions_scheduleId" ON "schedule_executions" ("scheduleId")
    `);

    // Create foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "schedules" 
      ADD CONSTRAINT "FK_schedules_contentId" 
      FOREIGN KEY ("contentId") REFERENCES "contents"("id") 
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "schedule_executions" 
      ADD CONSTRAINT "FK_schedule_executions_scheduleId" 
      FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") 
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "schedule_executions" 
      ADD CONSTRAINT "FK_schedule_executions_contentId" 
      FOREIGN KEY ("contentId") REFERENCES "contents"("id") 
      ON DELETE CASCADE
    `);

    // Create trigger to update updatedAt automatically for schedules
    await queryRunner.query(`
      CREATE TRIGGER update_schedules_updated_at 
      BEFORE UPDATE ON "schedules"
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    // Create GIN index for metadata
    await queryRunner.query(`
      CREATE INDEX "IDX_schedules_metadata_gin" ON "schedules" USING GIN ("metadata")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_schedule_executions_metadata_gin" ON "schedule_executions" USING GIN ("metadata")
    `);

    // Add table comments for documentation
    await queryRunner.query(`
      COMMENT ON TABLE "schedules" IS 'Content scheduling configuration with cron-based execution'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "schedules"."cronExpression" IS 'Cron expression defining when content should be played'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "schedules"."timezone" IS 'Timezone for schedule execution (e.g., America/New_York)'
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "schedule_executions" IS 'Execution history log for scheduled content playback'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop triggers
    await queryRunner.query(`DROP TRIGGER IF EXISTS update_schedules_updated_at ON "schedules"`);

    // Drop foreign keys
    await queryRunner.query(`ALTER TABLE "schedule_executions" DROP CONSTRAINT IF EXISTS "FK_schedule_executions_contentId"`);
    await queryRunner.query(`ALTER TABLE "schedule_executions" DROP CONSTRAINT IF EXISTS "FK_schedule_executions_scheduleId"`);
    await queryRunner.query(`ALTER TABLE "schedules" DROP CONSTRAINT IF EXISTS "FK_schedules_contentId"`);

    // Drop tables (indexes will be dropped automatically)
    await queryRunner.dropTable('schedule_executions');
    await queryRunner.dropTable('schedules');
  }
}
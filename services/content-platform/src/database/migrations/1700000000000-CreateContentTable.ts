import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

/**
 * Create Content Table Migration
 * 
 * Creates the main content table with proper indexing and constraints
 * Follows PostgreSQL best practices for performance and data integrity
 */
export class CreateContentTable1700000000000 implements MigrationInterface {
  name = 'CreateContentTable1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create ENUM types
    await queryRunner.query(`
      CREATE TYPE "content_type_enum" AS ENUM ('video', 'image', 'playlist')
    `);

    await queryRunner.query(`
      CREATE TYPE "content_status_enum" AS ENUM ('processing', 'ready', 'error', 'deleted')
    `);

    // Create the main content table
    await queryRunner.createTable(
      new Table({
        name: 'contents',
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
            name: 'fileName',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'originalFileName',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'mimeType',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'fileSize',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'filePath',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'thumbnailPath',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'title',
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
            name: 'tags',
            type: 'text[]',
            isNullable: false,
            default: 'ARRAY[]::text[]',
          },
          {
            name: 'contentType',
            type: 'content_type_enum',
            isNullable: false,
          },
          {
            name: 'duration',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'width',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'height',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: false,
            default: "'{}'::jsonb",
          },
          {
            name: 'status',
            type: 'content_status_enum',
            isNullable: false,
            default: "'processing'",
          },
          {
            name: 'isPublic',
            type: 'boolean',
            isNullable: false,
            default: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp with time zone',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp with time zone',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'deletedAt',
            type: 'timestamp with time zone',
            isNullable: true,
          },
        ],
        checks: [
          {
            name: 'CHK_fileSize_positive',
            expression: '"fileSize" > 0',
          },
          {
            name: 'CHK_title_not_empty',
            expression: 'LENGTH(TRIM("title")) > 0',
          },
          {
            name: 'CHK_dimensions_valid',
            expression: '("width" IS NULL AND "height" IS NULL) OR ("width" > 0 AND "height" > 0)',
          },
          {
            name: 'CHK_duration_positive',
            expression: '"duration" IS NULL OR "duration" > 0',
          },
        ],
      }),
      true
    );

    // Create indexes for performance
    await queryRunner.createIndex(
      'contents',
      new Index({
        name: 'IDX_contents_userId_status',
        columnNames: ['userId', 'status'],
      })
    );

    await queryRunner.createIndex(
      'contents',
      new Index({
        name: 'IDX_contents_contentType_status',
        columnNames: ['contentType', 'status'],
      })
    );

    await queryRunner.createIndex(
      'contents',
      new Index({
        name: 'IDX_contents_createdAt',
        columnNames: ['createdAt'],
      })
    );

    await queryRunner.createIndex(
      'contents',
      new Index({
        name: 'IDX_contents_isPublic',
        columnNames: ['isPublic'],
      })
    );

    await queryRunner.createIndex(
      'contents',
      new Index({
        name: 'IDX_contents_deletedAt',
        columnNames: ['deletedAt'],
      })
    );

    // Create GIN index for JSONB metadata
    await queryRunner.query(`
      CREATE INDEX "IDX_contents_metadata_gin" ON "contents" USING GIN ("metadata")
    `);

    // Create GIN index for tags array
    await queryRunner.query(`
      CREATE INDEX "IDX_contents_tags_gin" ON "contents" USING GIN ("tags")
    `);

    // Create partial index for active content (not deleted)
    await queryRunner.query(`
      CREATE INDEX "IDX_contents_active" ON "contents" ("userId", "createdAt") 
      WHERE "deletedAt" IS NULL
    `);

    // Create trigger to update updatedAt automatically
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW."updatedAt" = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    await queryRunner.query(`
      CREATE TRIGGER update_contents_updated_at 
      BEFORE UPDATE ON "contents"
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    // Add table and column comments for documentation
    await queryRunner.query(`
      COMMENT ON TABLE "contents" IS 'Main content storage table for user uploaded media files'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "contents"."metadata" IS 'JSONB field for storing flexible metadata like bitrate, codec, processing info, etc.'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "contents"."tags" IS 'Array of tags for content categorization and filtering'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "contents"."fileSize" IS 'File size in bytes'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "contents"."duration" IS 'Duration in seconds for video content'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop triggers and functions
    await queryRunner.query(`DROP TRIGGER IF EXISTS update_contents_updated_at ON "contents"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS update_updated_at_column()`);

    // Drop table (indexes will be dropped automatically)
    await queryRunner.dropTable('contents');

    // Drop ENUM types
    await queryRunner.query(`DROP TYPE "content_status_enum"`);
    await queryRunner.query(`DROP TYPE "content_type_enum"`);
  }
}
import { DataSource } from 'typeorm';
import { ContentEntity } from '@/database/entities/ContentEntity';

/**
 * Database Configuration
 * 
 * Single Responsibility: Database connection configuration
 * Environment-based configuration for different deployment stages
 */

interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  schema?: string;
  ssl?: boolean;
  logging?: boolean | string[];
  synchronize?: boolean;
  migrationsRun?: boolean;
  maxConnections?: number;
  acquireTimeout?: number;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

function getDatabaseConfig(): DatabaseConfig {
  const env = process.env.NODE_ENV || 'development';
  
  const baseConfig: DatabaseConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'content_platform',
    schema: process.env.DB_SCHEMA || 'public',
  };

  switch (env) {
    case 'test':
      return {
        ...baseConfig,
        database: process.env.DB_NAME || 'content_platform_test',
        logging: false,
        synchronize: true, // Auto-create tables in test
        migrationsRun: false,
      };

    case 'development':
      return {
        ...baseConfig,
        logging: true,
        synchronize: false, // Use migrations in development
        migrationsRun: true,
        maxConnections: 10,
      };

    case 'staging':
      return {
        ...baseConfig,
        ssl: true,
        logging: ['error', 'warn'],
        synchronize: false,
        migrationsRun: true,
        maxConnections: 20,
        acquireTimeout: 30000,
        timeout: 30000,
      };

    case 'production':
      return {
        ...baseConfig,
        ssl: true,
        logging: ['error'],
        synchronize: false, // Never auto-sync in production
        migrationsRun: true,
        maxConnections: 50,
        acquireTimeout: 60000,
        timeout: 60000,
        retryAttempts: 10,
        retryDelay: 3000,
      };

    default:
      return baseConfig;
  }
}

export const databaseConfig = getDatabaseConfig();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: databaseConfig.host,
  port: databaseConfig.port,
  username: databaseConfig.username,
  password: databaseConfig.password,
  database: databaseConfig.database,
  schema: databaseConfig.schema,
  ssl: databaseConfig.ssl,
  logging: databaseConfig.logging as any,
  synchronize: databaseConfig.synchronize,
  migrationsRun: databaseConfig.migrationsRun,
  entities: [ContentEntity],
  migrations: ['src/database/migrations/*.ts'],
  subscribers: ['src/database/subscribers/*.ts'],
  extra: {
    max: databaseConfig.maxConnections,
    acquireTimeoutMillis: databaseConfig.acquireTimeout,
    idleTimeoutMillis: databaseConfig.timeout,
    connectionTimeoutMillis: databaseConfig.timeout,
    // Connection pool configuration
    statement_timeout: 30000,
    idle_in_transaction_session_timeout: 30000,
  },
});
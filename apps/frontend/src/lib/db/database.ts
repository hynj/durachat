import { SQLocalDrizzle } from 'sqlocal/drizzle';
import { drizzle, SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { SchemaMigrations, migrationsArray } from './sql-migrations';
import { conversations, messages } from 'backend/src/db/user/data';

// Import types from backend schema
export type {
	Conversation,
	NewConversation,
	Message,
	NewMessage,
	Attachment,
	NewAttachment,
	Usage,
	NewUsage
} from 'backend/src/db/user/data';

// Frontend-only settings table for sync metadata
export const settings = sqliteTable('settings', {
	id: text('id').primaryKey(),
	value: text('value').notNull()
});

class DatabaseService {
	private static instance: DatabaseService;
	private sqLocalDriver: SQLocalDrizzle | null = null;
	private initialized = false;
	private initializing = false;
	private db: SqliteRemoteDatabase<any> | null = null;
	private currentUserId: string | null = null;

	private constructor() {}

	static getInstance(): DatabaseService {
		if (!DatabaseService.instance) {
			DatabaseService.instance = new DatabaseService();
		}
		return DatabaseService.instance;
	}

	async initialize(userId: string): Promise<SqliteRemoteDatabase<any>> {
		// If already initialized for this user, return existing database
		if (this.initialized && this.db && this.currentUserId === userId) {
			return this.db;
		}

		// If initialized for different user, cleanup and reinitialize
		if (this.initialized && this.currentUserId !== userId) {
			console.log(`Switching database from user ${this.currentUserId} to ${userId}`);
			await this.cleanup();
		}

		if (this.initializing) {
			// Wait for ongoing initialization with timeout
			const maxWait = 30000; // 30 seconds
			const startTime = Date.now();
			while (this.initializing && Date.now() - startTime < maxWait) {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
			if (this.db && this.currentUserId === userId) return this.db;
			if (this.initializing) {
				throw new Error('Database initialization timeout');
			}
		}

		this.initializing = true;

		try {
			console.log(`Initializing SQLite database for user: ${userId}`);

			// Create user-specific database name
			const dbName = `durachat-${userId}.db`;

			// Initialize SQLocal with timeout
			const initPromise = new Promise<SQLocalDrizzle>((resolve, reject) => {
				try {
					const db = new SQLocalDrizzle(dbName);
					resolve(db);
				} catch (error) {
					reject(error);
				}
			});

			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error('SQLocal initialization timeout')), 15000);
			});

			this.sqLocalDriver = await Promise.race([initPromise, timeoutPromise]);
			console.log(`SQLocal initialized for ${dbName}, running migrations...`);

			// Run migrations
			const migrations = new SchemaMigrations({
				sqliteInstance: this.sqLocalDriver,
				migrations: migrationsArray()
			});

			console.log('Running database migrations...');
			await migrations.runAll();

			// Test the database with a simple query
			console.log('Testing database connection...');
			const { sql } = this.sqLocalDriver;
			const testResult = await sql`SELECT COUNT(*) as count FROM settings`;
			console.log('Database test query result:', testResult);

			this.initialized = true;
			this.currentUserId = userId;
			console.log(`Database initialized successfully for user: ${userId}`);

			this.db = drizzle(this.sqLocalDriver.driver, this.sqLocalDriver.batchDriver);
			return this.db;
		} catch (error) {
			console.error('Failed to initialize database:', error);
			this.sqLocalDriver = null;
			this.initialized = false;
			this.currentUserId = null;
			throw error;
		} finally {
			this.initializing = false;
		}
	}

	async getDb(): Promise<SqliteRemoteDatabase<any>> {
		if (!this.db || !this.initialized) {
			throw new Error('Database not initialized. Call initialize(userId) first.');
		}
		return this.db;
	}

	async cleanup(): Promise<void> {
		console.log('Cleaning up database connection...');
		try {
			if (this.sqLocalDriver) {
				// SQLocal doesn't have explicit cleanup, but we reset our references
				this.sqLocalDriver = null;
			}
			this.db = null;
			this.initialized = false;
			this.currentUserId = null;
		} catch (error) {
			console.error('Error during database cleanup:', error);
		}
	}

	getCurrentUserId(): string | null {
		return this.currentUserId;
	}

	isInitialized(): boolean {
		return this.initialized;
	}

	isInitializing(): boolean {
		return this.initializing;
	}
}

export const dbService = DatabaseService.getInstance();

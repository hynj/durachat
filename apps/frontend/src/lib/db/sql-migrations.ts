import type { SQLocal } from 'sqlocal';
// Import the backend Drizzle migrations as raw text
import migration0000 from 'backend/drizzle/user/0000_fat_spitfire.sql?raw';
import migration0001 from 'backend/drizzle/user/0001_gray_silver_fox.sql?raw';
import migration0002 from 'backend/drizzle/user/0002_spicy_paibok.sql?raw';
import migration0003 from 'backend/drizzle/user/0003_majestic_lady_bullseye.sql?raw';
import migration0004 from 'backend/drizzle/user/0004_easy_forge.sql?raw';

function parseSQL(sql: string): string[] {
	// Split SQL by the Drizzle statement breakpoint
	const statements = sql
		.split('--> statement-breakpoint')
		.map((stmt) => stmt.trim())
		.filter((stmt) => {
			// Filter out empty statements, comments, PRAGMA statements, and sessions table
			return (
				stmt.length > 0 &&
				!stmt.startsWith('--') &&
				!stmt.startsWith('PRAGMA foreign_keys') &&
				!stmt.startsWith('/*') &&
				stmt !== '-->' &&
				!stmt.includes('-- statement-breakpoint') &&
				!stmt.includes('CREATE TABLE `sessions`') &&
				!stmt.includes('sessions_') && // Skip sessions indexes
				!stmt.includes('ON `sessions`')
			); // Skip sessions indexes
		})
		.map((stmt) => {
			// Clean up any remaining comments or artifacts
			return stmt
				.replace(/^--> statement-breakpoint\s*/gm, '')
				.replace(/^--.*$/gm, '') // Remove comment lines
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line.length > 0 && !line.startsWith('--'))
				.join('\n')
				.trim();
		})
		.filter((stmt) => stmt.length > 0);

	return statements;
}

export const migrationsArray = () => {
	return [
		{
			idMonotonicInc: 0,
			description: 'Create settings table for migration tracking',
			sql: `
        CREATE TABLE IF NOT EXISTS settings (
          id TEXT PRIMARY KEY,
          value TEXT
        );
      `
		},
		{
			idMonotonicInc: 1,
			description: 'Create chat tables (filtered from backend schema)',
			sql: migration0000
		},
		{
			idMonotonicInc: 2,
			description: 'Update attachments table structure',
			sql: migration0002
		},
		{
			idMonotonicInc: 3,
			description: 'Add conversation_id to attachments table',
			sql: migration0003
		},
		{
			idMonotonicInc: 4,
			description: 'Add reasoning_content column to messages table',
			sql: migration0004
		}
	];
};

export interface SchemaMigration {
	idMonotonicInc: number;
	description: string;
	sql?: string;
}

export interface SchemaMigrationsConfig {
	sqliteInstance: SQLocal;
	migrations: SchemaMigration[];
	__lastAppliedMigrationMonotonicID_OVERRIDE_FOR_MANUAL_MIGRATIONS?: number;
}

export class SchemaMigrations {
	_config: Omit<
		SchemaMigrationsConfig,
		'__lastAppliedMigrationMonotonicID_OVERRIDE_FOR_MANUAL_MIGRATIONS'
	>;
	_migrations: SchemaMigration[];
	_lastMigrationMonotonicId = -1;

	constructor(config: SchemaMigrationsConfig) {
		this._config = config;

		const migrations = [...config.migrations];
		migrations.sort((a, b) => a.idMonotonicInc - b.idMonotonicInc);
		const idSeen = new Set<number>();
		migrations.forEach((m) => {
			if (m.idMonotonicInc < 0) {
				throw new Error(`migration ID cannot be negative: ${m.idMonotonicInc}`);
			}
			if (idSeen.has(m.idMonotonicInc)) {
				throw new Error(`duplicate migration ID detected: ${m.idMonotonicInc}`);
			}
			idSeen.add(m.idMonotonicInc);
		});

		this._migrations = migrations;
	}

	hasMigrationsToRun() {
		if (!this._migrations.length) {
			return false;
		}
		return (
			this._lastMigrationMonotonicId !==
			this._migrations[this._migrations.length - 1].idMonotonicInc
		);
	}

	async runAll(sqlGen?: (idMonotonicInc: number) => string) {
		const result = {
			rowsRead: 0,
			rowsWritten: 0
		};

		if (!this.hasMigrationsToRun()) {
			return result;
		}

		const { sql } = this._config.sqliteInstance;
		let lastMigratedVersion = undefined;
		let lastMigrationNumber: Array<any> | null = null;

		try {
			lastMigrationNumber = await sql`SELECT value FROM settings WHERE id = 'migration_version'`;
		} catch (e) {
			// Expected on first run when settings table doesn't exist yet
			// Only log if it's not a "no such table" error
			if (e?.message && !e.message.toLowerCase().includes('no such table')) {
				console.error('Unexpected migration version check error:', e);
			}
		}

		if (lastMigrationNumber != null && lastMigrationNumber.length > 0) {
			lastMigratedVersion = lastMigrationNumber[0].value ?? null;
		}
		this._lastMigrationMonotonicId = lastMigratedVersion ?? -1;

		// Skip all the applied ones.
		let idx = 0,
			sz = this._migrations.length;
		while (idx < sz && this._migrations[idx].idMonotonicInc <= this._lastMigrationMonotonicId) {
			idx += 1;
		}

		// Make sure we still have migrations to run.
		if (idx >= sz) {
			return result;
		}

		const { transaction } = this._config.sqliteInstance;
		const migrationsToRun = this._migrations.slice(idx);

		try {
			await transaction(async (tx) => {
				for (const migration of migrationsToRun) {
					const query = migration.sql ?? sqlGen?.(migration.idMonotonicInc);
					if (!query) {
						throw new Error(
							`migration with neither 'sql' nor 'sqlGen' provided: ${migration.idMonotonicInc}`
						);
					}

					console.log(`Running migration ${migration.idMonotonicInc}: ${migration.description}`);

					// Parse and execute each SQL statement
					const statements = parseSQL(query);
					console.log(
						`Parsed ${statements.length} statements for migration ${migration.idMonotonicInc}`
					);

					for (let i = 0; i < statements.length; i++) {
						const statement = statements[i].trim();
						if (statement) {
							console.log(`Executing statement ${i + 1}:`, statement.substring(0, 100) + '...');
							try {
								await tx.sql(statement);
							} catch (error) {
								console.error(`Failed to execute statement ${i + 1}:`, statement);
								throw error;
							}
						}
					}

					await tx.sql`INSERT OR REPLACE INTO settings (id, value) VALUES ('migration_version', ${migration.idMonotonicInc})`;
				}
			});

			this._lastMigrationMonotonicId = migrationsToRun[migrationsToRun.length - 1].idMonotonicInc;
			console.log(`Completed ${migrationsToRun.length} migrations`);
		} catch (error) {
			console.error(`Migration failed:`, error);
			throw new Error(`MIGRATION_FAILED: ${error.message}`);
		}

		return result;
	}
}

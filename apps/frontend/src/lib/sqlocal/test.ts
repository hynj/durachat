import { SQLocalDrizzle } from 'sqlocal/drizzle';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { sqliteTable, int, text } from 'drizzle-orm/sqlite-core';

const { driver } = new SQLocalDrizzle('database.sqlite3');
export const db = drizzle(driver);

export const groceries = sqliteTable('groceries', {
	id: int('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull()
});

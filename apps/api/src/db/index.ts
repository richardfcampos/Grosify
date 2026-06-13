import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL não definida');

export const sql = postgres(databaseUrl, { max: 10 });
export const db = drizzle(sql, { schema });

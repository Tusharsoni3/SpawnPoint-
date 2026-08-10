import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Database environment variable is missing");
}

const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });

export async function connectDB() {
  try {
    await db.execute('SELECT 1');
    console.log('[Database]: PostgreSQL connected successfully!');
  } catch (error) {
    console.error("[Database]: Connection Failed");
    console.error("Error:", error);
    throw error;
  }
}
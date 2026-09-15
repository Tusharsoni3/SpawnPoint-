import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Database environment variable is missing");
}

const pool = new Pool({ connectionString });

export async function connectDB() {
  try {
    console.log('[Learder Board Database]: PostgreSQL connected successfully!');
  } catch (error) {
    console.error("[Learder Board Database]: Connection Failed");
    console.error("Error:", error);
    throw error;
  }
}
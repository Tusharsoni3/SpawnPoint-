import { drizzle } from 'drizzle-orm/postgres-js';;
import * as schema  from "./schema.js"
import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL!;
if (!connectionString) {
  throw new Error("Database enviornment variable is missing");
}
export const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });

export async function connectDB() {
  try {
    await client`SELECT 1`;
    console.log('[Database]: PostgreSQL connected successfully!');
  } catch (error) {
    console.error("[Database] : Connection Failed");
    console.error("Error : ",error);
  }
}
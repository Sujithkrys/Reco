import pkg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const { Client } = pkg;

const connectionString = "postgresql://postgres:Teamscratch%40123@db.aczpibbgrksqclnowzin.supabase.co:5432/postgres";

async function run() {
  const client = new Client({
    connectionString,
  });

  try {
    await client.connect();
    console.log("Connected to Supabase Postgres.");

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const sql = readFileSync(join(__dirname, "supabase/migrations/20231010000001_alter.sql"), "utf-8");
    
    await client.query(sql);
    console.log("Migration applied successfully.");

  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await client.end();
  }
}

run();

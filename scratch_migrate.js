import pkg from "pg";
const { Client } = pkg;

const connectionString = "postgresql://postgres:Teamscratch%40123@db.aczpibbgrksqclnowzin.supabase.co:5432/postgres";

async function run() {
  const client = new Client({
    connectionString,
  });

  try {
    await client.connect();
    console.log("Connected to Supabase Postgres.");

    // Create projects table
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        data JSONB NOT NULL,
        thumbnail_path TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log("Projects table created.");

  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await client.end();
  }
}

run();

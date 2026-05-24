/**
 * One-time migration runner — runs 001_init.sql then seed.sql against Supabase Postgres.
 * Usage: node scripts/migrate.mjs
 * Safe to run multiple times (all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING).
 */
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const PROJECT_REF = "rtsgmkbcxoasilefiprk";

if (!DB_PASSWORD) {
  console.error("❌  Set SUPABASE_DB_PASSWORD in your env before running this script.");
  process.exit(1);
}

const client = new pg.Client({
  host: `db.${PROJECT_REF}.supabase.co`,
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

const files = [
  path.join(__dirname, "../packages/db/migrations/001_init.sql"),
  path.join(__dirname, "../packages/db/seed.sql"),
];

try {
  console.log("🔌  Connecting to Supabase Postgres…");
  await client.connect();
  console.log("✅  Connected.\n");

  for (const file of files) {
    const sql = fs.readFileSync(file, "utf8");
    const name = path.basename(file);
    console.log(`⏳  Running ${name}…`);
    await client.query(sql);
    console.log(`✅  ${name} done.\n`);
  }

  console.log("🎉  All migrations applied successfully!");
} catch (err) {
  console.error("❌  Migration failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}

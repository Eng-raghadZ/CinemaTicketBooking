/**
 * Applies /supabase/migrations/*.sql in filename order, tracking what has
 * already been applied in a `schema_migrations` table so this is safe to
 * re-run (idempotent at the migration-file level; individual files are
 * plain SQL and assumed to be forward-only per standard migration practice).
 *
 * Usage:
 *   DATABASE_URL=postgres://... npm run db:migrate
 *   npm run db:migrate:test   (uses TEST_DATABASE_URL)
 */
import { config } from "dotenv";

config({ path: ".env.local" });
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

async function main() {
  const urlArg = process.argv.find((a) => a.startsWith("--database-url="));
  const databaseUrl = urlArg?.split("=")[1] ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("DATABASE_URL is not set (and no --database-url= passed).");
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    await sql`
      create table if not exists schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      )
    `;

    const applied = new Set(
      (await sql<{ filename: string }[]>`select filename from schema_migrations`).map(
        (r) => r.filename,
      ),
    );

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }
      const contents = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
      console.log(`Applying ${file}...`);
      await sql.unsafe(contents);
      await sql`insert into schema_migrations (filename) values (${file})`;
      appliedCount++;
    }

    console.log(
      appliedCount === 0
        ? "No new migrations to apply."
        : `Applied ${appliedCount} migration(s).`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

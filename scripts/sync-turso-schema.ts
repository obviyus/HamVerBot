import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@libsql/client";

const DEFAULT_OUTPUT_PATH = "db/schema.sql";

const targetPath = resolve(Bun.argv[2] ?? DEFAULT_OUTPUT_PATH);
const databaseUrl = Bun.env.TURSO_DATABASE_URL;
const authToken = Bun.env.TURSO_AUTH_TOKEN;

if (!databaseUrl) {
	throw new Error("Missing TURSO_DATABASE_URL");
}

if (!authToken) {
	throw new Error("Missing TURSO_AUTH_TOKEN");
}

const db = createClient({
	url: databaseUrl,
	authToken,
});

const result = await db.execute(`
	SELECT type, name, sql
	FROM sqlite_master
	WHERE type IN ('table', 'index')
	  AND sql IS NOT NULL
	  AND name NOT LIKE 'sqlite_%'
	ORDER BY CASE type
		WHEN 'table' THEN 0
		ELSE 1
	END,
		name
`);

function getSqlStatement(row: Record<string, unknown>): string {
	if (typeof row.sql !== "string") {
		throw new Error("Invalid sqlite_master row: expected sql to be a string");
	}

	return row.sql;
}

function normalizeStatement(sql: string): string {
	let normalized = sql
		.trim()
		.replace(/\r\n/g, "\n")
		.replace(/\n[ \t]+/g, "\n  ");

	if (
		normalized.startsWith("CREATE TABLE ") &&
		!normalized.startsWith("CREATE TABLE IF NOT EXISTS ")
	) {
		normalized = normalized.replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ");
	}

	if (
		normalized.startsWith("CREATE UNIQUE INDEX ") &&
		!normalized.startsWith("CREATE UNIQUE INDEX IF NOT EXISTS ")
	) {
		normalized = normalized.replace("CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ");
	}

	if (
		normalized.startsWith("CREATE INDEX ") &&
		!normalized.startsWith("CREATE INDEX IF NOT EXISTS ")
	) {
		normalized = normalized.replace("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ");
	}

	return normalized
		.split("\n")
		.map((line) => line.replace(/[ \t]+$/g, ""))
		.join("\n");
}

const statements = result.rows
	.map(getSqlStatement)
	.map(normalizeStatement)
	.map((sql) => `${sql};`);

if (statements.length === 0) {
	throw new Error("No schema statements found in sqlite_master");
}

await mkdir(dirname(targetPath), { recursive: true });

const nextSchema = `${statements.join("\n\n")}\n`;
const currentSchema = await Bun.file(targetPath)
	.text()
	.catch(() => null);

if (currentSchema === nextSchema) {
	console.log(`Schema already up to date: ${targetPath}`);
} else {
	await Bun.write(targetPath, nextSchema);
	console.log(`Wrote ${statements.length} statements to ${targetPath}`);
}

db.close();

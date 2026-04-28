import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@libsql/client";

const DEFAULT_OUTPUT_PATH = "db/schema.sql";
const IF_NOT_EXISTS_REPLACEMENTS = [
	["CREATE TABLE IF NOT EXISTS ", "CREATE TABLE "],
	["CREATE UNIQUE INDEX IF NOT EXISTS ", "CREATE UNIQUE INDEX "],
	["CREATE INDEX IF NOT EXISTS ", "CREATE INDEX "],
] as const;

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

const statements = result.rows
	.map((row) => {
		if (typeof row.sql !== "string") {
			throw new Error("Invalid sqlite_master row: expected sql to be a string");
		}

		return row.sql;
	})
	.map((sql) => {
		let normalized = sql
			.trim()
			.replace(/\r\n/g, "\n")
			.replace(/\n[ \t]+/g, "\n  ");
		for (const [expanded, compact] of IF_NOT_EXISTS_REPLACEMENTS) {
			if (normalized.startsWith(compact) && !normalized.startsWith(expanded)) {
				normalized = normalized.replace(compact, expanded);
				break;
			}
		}

		return `${normalized
			.split("\n")
			.map((line) => line.replace(/[ \t]+$/g, ""))
			.join("\n")};`;
	});

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

import { beforeEach, describe, expect, mock, test } from "bun:test";

const createClientMock = mock((_config: unknown) => ({
	execute: executeMock,
	close: closeMock,
}));
const executeMock = mock(async (_query?: unknown) => ({ rows: [] as Array<Record<string, unknown>> }));
const closeMock = mock(() => {});

void mock.module("@libsql/client", () => ({
	createClient: createClientMock,
}));

async function loadDatabaseModule() {
	return import(`../src/database.ts?test=${crypto.randomUUID()}`);
}

beforeEach(() => {
	process.env.TURSO_DATABASE_URL = "libsql://hamverbot";
	process.env.TURSO_AUTH_TOKEN = "secret";
	createClientMock.mockReset();
	createClientMock.mockImplementation((_config: unknown) => ({
		execute: executeMock,
		close: closeMock,
	}));
	executeMock.mockReset();
	closeMock.mockReset();
});

describe("database module", () => {
	test("initializes schema including autopost tables and seeds event types", async () => {
		executeMock.mockImplementation(async (query) => {
			if (typeof query === "string" && query.includes("SELECT COUNT(*) as count FROM event_type")) {
				return { rows: [{ count: 0 }] };
			}

			return { rows: [] };
		});

		const database = await loadDatabaseModule();
		await database.initDatabase();

		expect(createClientMock).toHaveBeenCalledWith({
			url: "libsql://hamverbot",
			authToken: "secret",
		});

		const sqlCalls = executeMock.mock.calls
			.map(([query]) => query)
			.filter((query): query is string => typeof query === "string");

		expect(sqlCalls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS autopost_channels"))).toBe(
			true,
		);
		expect(
			sqlCalls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS autopost_seen_messages")),
		).toBe(true);

		const insertCalls = executeMock.mock.calls.filter(([query]) => {
			return typeof query === "object" && query && "sql" in query && query.sql.includes("INSERT INTO event_type");
		});
		expect(insertCalls).toHaveLength(8);
	});

	test("caches the DB client until closeDb is called", async () => {
		executeMock.mockImplementation(async (query) => {
			if (typeof query === "string" && query.includes("SELECT COUNT(*) as count FROM event_type")) {
				return { rows: [{ count: 1 }] };
			}

			return { rows: [] };
		});

		const database = await loadDatabaseModule();
		await database.getDb();
		await database.getDb();
		expect(createClientMock).toHaveBeenCalledTimes(1);

		await database.closeDb();
		await database.getDb();
		expect(closeMock).toHaveBeenCalledTimes(1);
		expect(createClientMock).toHaveBeenCalledTimes(2);
	});

	test("reads and writes autopost channel state", async () => {
		executeMock.mockImplementation(async (query) => {
			if (typeof query === "string" && query.includes("SELECT COUNT(*) as count FROM event_type")) {
				return { rows: [{ count: 1 }] };
			}

			if (typeof query === "string" && query.includes("SELECT name FROM autopost_channels")) {
				return { rows: [{ name: "#test" }, { name: "#f1" }] };
			}

			if (typeof query === "object" && query && "sql" in query) {
				const sql = String(query.sql);

				if (sql.includes("SELECT 1 FROM autopost_channels")) {
					return { rows: [{ 1: 1 }] };
				}
				if (sql.includes("SELECT message_key FROM autopost_seen_messages")) {
					return { rows: [{ message_key: "red" }, { message_key: "penalty" }] };
				}
			}

			return { rows: [] };
		});

		const database = await loadDatabaseModule();
		await database.enableAutopostChannel("#test");

		expect(database.isAutopostChannelEnabled("#test")).resolves.toBe(true);
		expect(database.getAutopostChannels()).resolves.toEqual(["#test", "#f1"]);
		expect(database.getSeenAutopostMessageKeys("2026/race/")).resolves.toEqual(
			new Set(["red", "penalty"]),
		);

		await database.markAutopostMessagesSeen("2026/race/", ["red", "penalty"]);

		const objectCalls = executeMock.mock.calls
			.map(([query]) => query)
			.filter((query): query is { sql: string; args?: unknown[] } => {
				return typeof query === "object" && query !== null && "sql" in query;
			});

		expect(
			objectCalls.some((query) => {
				return (
					query.sql === "INSERT OR IGNORE INTO autopost_channels (name) VALUES (?)" &&
					query.args?.[0] === "#test"
				);
			}),
		).toBe(true);
		expect(
			objectCalls.filter((query) => query.sql.includes("INSERT OR IGNORE INTO autopost_seen_messages")),
		).toHaveLength(2);
	});
});

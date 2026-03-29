import { beforeEach, describe, expect, mock, test } from "bun:test";

const createClientMock = mock((_config: unknown) => ({
	execute: executeMock,
	batch: batchMock,
	close: closeMock,
}));
const executeMock = mock(async (_query?: unknown) => ({
	rows: [] as Array<Record<string, unknown>>,
}));
const batchMock = mock(async (_statements?: unknown, _mode?: unknown) => []);
const closeMock = mock(() => {});

void mock.module("@libsql/client", () => ({
	createClient: createClientMock,
}));

async function loadDatabaseModule() {
	return import(`../src/database.ts?test=${crypto.randomUUID()}`);
}

function hasSqlQuery(query: unknown): query is { sql: string; args?: unknown[] } {
	return (
		typeof query === "object" && query !== null && "sql" in query && typeof query.sql === "string"
	);
}

beforeEach(() => {
	process.env.TURSO_DATABASE_URL = "libsql://hamverbot";
	process.env.TURSO_AUTH_TOKEN = "secret";
	createClientMock.mockReset();
	createClientMock.mockImplementation((_config: unknown) => ({
		execute: executeMock,
		batch: batchMock,
		close: closeMock,
	}));
	executeMock.mockReset();
	batchMock.mockReset();
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

		expect(
			sqlCalls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS autopost_channels")),
		).toBe(true);
		expect(
			sqlCalls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS autopost_seen_messages")),
		).toBe(true);

		const insertCalls = executeMock.mock.calls.filter(([query]) => {
			return hasSqlQuery(query) && query.sql.includes("INSERT INTO event_type");
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

		const objectCalls = executeMock.mock.calls.map(([query]) => query).filter(hasSqlQuery);

		expect(
			objectCalls.some((query) => {
				return (
					query.sql === "INSERT OR IGNORE INTO autopost_channels (name) VALUES (?)" &&
					query.args?.[0] === "#test"
				);
			}),
		).toBe(true);
		expect(batchMock).toHaveBeenCalledWith(
			[
				{
					sql: `INSERT OR IGNORE INTO autopost_seen_messages (session_path, message_key)
				VALUES (?, ?)`,
					args: ["2026/race/", "red"],
				},
				{
					sql: `INSERT OR IGNORE INTO autopost_seen_messages (session_path, message_key)
				VALUES (?, ?)`,
					args: ["2026/race/", "penalty"],
				},
			],
			"write",
		);
	});

	test("syncs future calendar rows to the latest feed", async () => {
		executeMock.mockImplementation(async (query) => {
			if (typeof query === "string" && query.includes("SELECT COUNT(*) as count FROM event_type")) {
				return { rows: [{ count: 1 }] };
			}

			return { rows: [] };
		});

		const database = await loadDatabaseModule();
		await database.storeEvents([
			{
				meetingName: "FORMULA 1 AUSTRALIAN GRAND PRIX 2026",
				eventTypeId: 2,
				startTime: 1772802000,
				eventSlug: "2026-australian-gp-fp1",
			},
			{
				meetingName: "FORMULA 1 AUSTRALIAN GRAND PRIX 2026",
				eventTypeId: 7,
				startTime: 1772974800,
				eventSlug: "2026-australian-gp-race",
			},
		]);

		expect(batchMock).toHaveBeenCalledWith(
			[
				{
					sql: `DELETE FROM events
			WHERE start_time > unixepoch()
			AND event_slug NOT IN (?, ?)`,
					args: ["2026-australian-gp-fp1", "2026-australian-gp-race"],
				},
				{
					sql: `INSERT INTO events (meeting_name, event_type_id, start_time, event_slug)
	VALUES (?, ?, ?, ?)
	ON CONFLICT(event_slug) DO UPDATE SET
		meeting_name = excluded.meeting_name,
		event_type_id = excluded.event_type_id,
		start_time = excluded.start_time`,
					args: ["FORMULA 1 AUSTRALIAN GRAND PRIX 2026", 2, 1772802000, "2026-australian-gp-fp1"],
				},
				{
					sql: `INSERT INTO events (meeting_name, event_type_id, start_time, event_slug)
	VALUES (?, ?, ?, ?)
	ON CONFLICT(event_slug) DO UPDATE SET
		meeting_name = excluded.meeting_name,
		event_type_id = excluded.event_type_id,
		start_time = excluded.start_time`,
					args: ["FORMULA 1 AUSTRALIAN GRAND PRIX 2026", 7, 1772974800, "2026-australian-gp-race"],
				},
			],
			"write",
		);
	});
});

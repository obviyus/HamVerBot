import { createClient } from "@libsql/client";
import type { Driver } from "~/types/models";
import { EventType } from "~/types/event-type";

const EVENT_TYPE_DEFINITIONS = [
	{ id: EventType.LiveryReveal, name: "Livery Reveal" },
	{ id: EventType.FreePractice1, name: "Practice 1" },
	{ id: EventType.FreePractice2, name: "Practice 2" },
	{ id: EventType.FreePractice3, name: "Practice 3" },
	{ id: EventType.Qualifying, name: "Qualifying" },
	{ id: EventType.Sprint, name: "Sprint" },
	{ id: EventType.Race, name: "Race" },
	{ id: EventType.SprintQualifying, name: "Sprint Qualifying" },
] as const;

const EVENT_TYPE_NAMES: Record<number, string> = Object.fromEntries(
	EVENT_TYPE_DEFINITIONS.map((eventType) => [eventType.id, eventType.name]),
);

const UPSERT_EVENT_SQL = `INSERT INTO events (meeting_name, event_type_id, start_time, event_slug)
	VALUES (?, ?, ?, ?)
	ON CONFLICT(event_slug) DO UPDATE SET
		meeting_name = excluded.meeting_name,
		event_type_id = excluded.event_type_id,
		start_time = excluded.start_time`;

const UPSERT_DRIVER_SQL = `INSERT INTO driver_list (
	racing_number, reference, first_name, last_name, full_name,
	broadcast_name, tla, team_name, team_color
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(racing_number) DO UPDATE SET
	reference = excluded.reference,
	first_name = excluded.first_name,
	last_name = excluded.last_name,
	full_name = excluded.full_name,
	broadcast_name = excluded.broadcast_name,
	tla = excluded.tla,
	team_name = excluded.team_name,
	team_color = excluded.team_color`;

export interface Event {
	meetingName: string;
	eventTypeId: EventType;
	startTime: number;
	eventSlug: string;
}

const config = {
	url: process.env.TURSO_DATABASE_URL,
	authToken: process.env.TURSO_AUTH_TOKEN,
};

let dbInstance: ReturnType<typeof createClient> | null = null;

export async function initDatabase(): Promise<ReturnType<typeof createClient>> {
	try {
		if (!config.url || !config.authToken) {
			throw new Error("Missing Turso database configuration");
		}

		const client = createClient({
			url: config.url,
			authToken: config.authToken,
		});

		const schemaStatements = [
			`CREATE TABLE IF NOT EXISTS event_type (
				id INTEGER PRIMARY KEY,
				name VARCHAR(255) NOT NULL UNIQUE
			)`,
			`CREATE TABLE IF NOT EXISTS events (
				id INTEGER PRIMARY KEY,
				meeting_name VARCHAR(255) NOT NULL,
				event_type_id INTEGER NOT NULL,
				start_time INTEGER NOT NULL,
				event_slug VARCHAR(255) NOT NULL UNIQUE,
				FOREIGN KEY (event_type_id) REFERENCES event_type (id)
			)`,
			`CREATE TABLE IF NOT EXISTS results (
				id INTEGER PRIMARY KEY,
				event_id INTEGER NOT NULL,
				path VARCHAR(255) NOT NULL UNIQUE,
				data JSON NOT NULL,
				create_time INTEGER NOT NULL DEFAULT (unixepoch()),
				FOREIGN KEY (event_id) REFERENCES events (id)
			)`,
			`CREATE TABLE IF NOT EXISTS channels (
				id INTEGER PRIMARY KEY,
				name VARCHAR(255) NOT NULL UNIQUE,
				create_time INTEGER NOT NULL DEFAULT (unixepoch())
			)`,
			`CREATE TABLE IF NOT EXISTS autopost_channels (
				id INTEGER PRIMARY KEY,
				name VARCHAR(255) NOT NULL UNIQUE,
				create_time INTEGER NOT NULL DEFAULT (unixepoch())
			)`,
			`CREATE TABLE IF NOT EXISTS autopost_seen_messages (
				id INTEGER PRIMARY KEY,
				session_path VARCHAR(255) NOT NULL,
				message_key VARCHAR(1024) NOT NULL,
				create_time INTEGER NOT NULL DEFAULT (unixepoch()),
				UNIQUE(session_path, message_key)
			)`,
			`CREATE TABLE IF NOT EXISTS driver_list (
				racing_number INTEGER PRIMARY KEY,
				reference VARCHAR(255) NOT NULL,
				first_name VARCHAR(255) NOT NULL,
				last_name VARCHAR(255) NOT NULL,
				full_name VARCHAR(255) NOT NULL,
				broadcast_name VARCHAR(255) NOT NULL,
				tla VARCHAR(255) NOT NULL,
				team_name VARCHAR(255) NOT NULL,
				team_color VARCHAR(255) NOT NULL
			)`,
			`CREATE TABLE IF NOT EXISTS championship_standings (
				id INTEGER PRIMARY KEY,
				type INTEGER NOT NULL UNIQUE,
				data JSON NOT NULL,
				create_time INTEGER NOT NULL DEFAULT (unixepoch())
			)`,
			`CREATE INDEX IF NOT EXISTS idx_events_start_time
			ON events (start_time)`,
			`CREATE INDEX IF NOT EXISTS idx_events_event_type_id_start_time
			ON events (event_type_id, start_time)`,
			`CREATE INDEX IF NOT EXISTS idx_events_meeting_name_event_type_id
			ON events (meeting_name, event_type_id)`,
			`CREATE INDEX IF NOT EXISTS idx_results_create_time
			ON results (create_time)`,
		] as const;

		for (const statement of schemaStatements) {
			await client.execute(statement);
		}

		for (const type of EVENT_TYPE_DEFINITIONS) {
			await client.execute({
				sql: `INSERT INTO event_type (id, name)
					SELECT ?, ?
					WHERE NOT EXISTS (SELECT 1 FROM event_type WHERE id = ?)`,
				args: [type.id, type.name, type.id],
			});
		}

		return client;
	} catch (error) {
		console.error("Failed to initialize database:", error);
		throw error;
	}
}

export async function getDb(): Promise<ReturnType<typeof createClient>> {
	if (!dbInstance) {
		dbInstance = await initDatabase();
	}
	return dbInstance;
}

export async function closeDb(): Promise<void> {
	if (dbInstance) {
		dbInstance.close();
		dbInstance = null;
	}
}

async function queryExists(sql: string, args: Array<string | number>): Promise<boolean> {
	const db = await getDb();
	const result = await db.execute({ sql, args });
	return result.rows.length > 0;
}

async function queryStringList(
	sql: string,
	column: string,
	args: Array<string | number> = [],
): Promise<string[]> {
	const db = await getDb();
	const result = args.length === 0 ? await db.execute(sql) : await db.execute({ sql, args });
	return result.rows.map((row) => row[column] as string);
}

export async function storeEvents(events: Event[]): Promise<void> {
	if (events.length === 0) return;

	try {
		const db = await getDb();
		const eventSlugs = events.map((event) => event.eventSlug);
		const staleUpcomingEventsSql = `DELETE FROM events
			WHERE start_time > unixepoch()
			AND event_slug NOT IN (${eventSlugs.map(() => "?").join(", ")})`;
		await db.batch(
			[
				{
					sql: staleUpcomingEventsSql,
					args: eventSlugs,
				},
				...events.map((event) => ({
					sql: UPSERT_EVENT_SQL,
					args: [event.meetingName, event.eventTypeId, event.startTime, event.eventSlug],
				})),
			],
			"write",
		);

		console.log(`Stored ${events.length} events in the database`);
	} catch (error) {
		console.error("Error storing events:", error);
	}
}

export async function storeDrivers(drivers: Driver[]): Promise<void> {
	if (drivers.length === 0) return;

	try {
		const db = await getDb();
		await db.batch(
			drivers.map((driver) => ({
				sql: UPSERT_DRIVER_SQL,
				args: [
					driver.racingNumber,
					driver.reference,
					driver.firstName,
					driver.lastName,
					driver.fullName,
					driver.broadcastName,
					driver.tla,
					driver.teamName,
					driver.teamColor,
				],
			})),
			"write",
		);
	} catch (error) {
		console.error("Error storing drivers:", error);
	}
}

export async function getNextEvent(eventType?: EventType): Promise<{
	meetingName: string;
	eventType: EventType;
	startTime: number;
} | null> {
	try {
		const db = await getDb();
		const args = [eventType ?? null, eventType ?? null];
		const sql = `
			SELECT meeting_name, event_type_id, start_time
			FROM events
			WHERE start_time > unixepoch()
				AND (? IS NULL OR event_type_id = ?)
			ORDER BY start_time
			LIMIT 1
		`;

		console.log(`Executing query: ${sql} with params: ${args.join(", ")}`);

		const result = await db.execute({ sql, args });

		if (result.rows.length === 0) {
			console.log("No upcoming events found in database query");
			return null;
		}

		const row = result.rows[0];
		return {
			meetingName: row.meeting_name as string,
			eventType: row.event_type_id as EventType,
			startTime: row.start_time as number,
		};
	} catch (error) {
		console.error("Error getting next event:", error);
		if (error instanceof Error) {
			console.error(`Error stack: ${error.stack}`);
		}
		return null;
	}
}

export async function getLatestPath(): Promise<string | null> {
	try {
		const db = await getDb();
		const result = await db.execute("SELECT path FROM results ORDER BY create_time DESC LIMIT 1");

		if (result.rows.length === 0) {
			const { readCurrentEvent } = await import("~/fetch");
			const { path, isComplete } = await readCurrentEvent();
			if (isComplete) {
				return path;
			}
			return null;
		}

		return result.rows[0].path as string;
	} catch (error) {
		console.error("Error getting latest path:", error);
		return null;
	}
}

export async function isEventDelivered(path: string): Promise<boolean> {
	try {
		return queryExists("SELECT 1 FROM results WHERE path = ?", [path]);
	} catch (error) {
		console.error("Error checking if event is delivered:", error);
		return false;
	}
}

export async function getAllChannels(): Promise<string[]> {
	try {
		return queryStringList("SELECT name FROM channels", "name");
	} catch (error) {
		console.error("Error getting all channels:", error);
		return [];
	}
}

export async function enableAutopostChannel(channelName: string): Promise<void> {
	const db = await getDb();
	await db.execute({
		sql: "INSERT OR IGNORE INTO autopost_channels (name) VALUES (?)",
		args: [channelName],
	});
}

export async function isAutopostChannelEnabled(channelName: string): Promise<boolean> {
	return queryExists("SELECT 1 FROM autopost_channels WHERE name = ? LIMIT 1", [channelName]);
}

export async function getAutopostChannels(): Promise<string[]> {
	return queryStringList("SELECT name FROM autopost_channels", "name");
}

export async function getSeenAutopostMessageKeys(sessionPath: string): Promise<Set<string>> {
	return new Set(
		await queryStringList(
			"SELECT message_key FROM autopost_seen_messages WHERE session_path = ?",
			"message_key",
			[sessionPath],
		),
	);
}

export async function markAutopostMessagesSeen(
	sessionPath: string,
	messageKeys: string[],
): Promise<void> {
	if (messageKeys.length === 0) return;

	const db = await getDb();
	await db.batch(
		messageKeys.map((messageKey) => ({
			sql: `INSERT OR IGNORE INTO autopost_seen_messages (session_path, message_key)
				VALUES (?, ?)`,
			args: [sessionPath, messageKey],
		})),
		"write",
	);
}

export async function storeEventResult(eventId: number, path: string, data: object): Promise<void> {
	try {
		const db = await getDb();
		await db.execute({
			sql: "INSERT INTO results (event_id, path, data) VALUES (?, ?, json(?))",
			args: [eventId, path, JSON.stringify(data)],
		});
	} catch (error) {
		console.error("Error storing event result:", error);
	}
}

export async function getEventTypeName(eventTypeId: EventType): Promise<string> {
	return EVENT_TYPE_NAMES[eventTypeId] ?? "Unknown";
}

export async function storeChampionshipStandings(type: number, data: object): Promise<void> {
	try {
		const db = await getDb();
		await db.execute({
			sql: `INSERT INTO championship_standings (type, data) 
				VALUES (?, json(?)) 
				ON CONFLICT(type) DO UPDATE SET 
					data = json(excluded.data), 
					create_time = unixepoch()`,
			args: [type, JSON.stringify(data)],
		});
	} catch (error) {
		console.error("Error storing championship standings:", error);
	}
}

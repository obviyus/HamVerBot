import { createClient } from "@libsql/client";
import { EventType } from "~/types/event-type";
export interface Event {
	meetingName: string;
	eventTypeId: EventType;
	startTime: number;
	eventSlug: string;
}

export interface EventResult {
	id: number;
	eventId: number;
	path: string;
	data: object;
	createTime: number;
}

export interface Driver {
	racingNumber: number;
	reference: string;
	firstName: string;
	lastName: string;
	fullName: string;
	broadcastName: string;
	tla: string;
	teamName: string;
	teamColor: string;
}

export interface DbEvent {
	id: number;
	meetingName: string;
	eventTypeId: EventType;
	startTime: number;
}

// Database configuration
const config = {
	url: process.env.TURSO_DATABASE_URL,
	authToken: process.env.TURSO_AUTH_TOKEN,
};

// Single database instance
let dbInstance: ReturnType<typeof createClient> | null = null;

// Function to initialize the database
export async function initDatabase(): Promise<ReturnType<typeof createClient>> {
	try {
		if (!config.url || !config.authToken) {
			throw new Error("Missing Turso database configuration");
		}

		const client = createClient({
			url: config.url,
			authToken: config.authToken,
		});

		// Create tables if they don't exist
		await client.execute(`
			CREATE TABLE IF NOT EXISTS event_type (
				id INTEGER PRIMARY KEY,
				name VARCHAR(255) NOT NULL UNIQUE
			)
		`);

		await client.execute(`
			CREATE TABLE IF NOT EXISTS events (
				id INTEGER PRIMARY KEY,
				meeting_name VARCHAR(255) NOT NULL,
				event_type_id INTEGER NOT NULL,
				start_time INTEGER NOT NULL,
				event_slug VARCHAR(255) NOT NULL UNIQUE,
				FOREIGN KEY (event_type_id) REFERENCES event_type (id)
			)
		`);

		await client.execute(`
			CREATE TABLE IF NOT EXISTS results (
				id INTEGER PRIMARY KEY,
				event_id INTEGER NOT NULL,
				path VARCHAR(255) NOT NULL UNIQUE,
				data JSON NOT NULL,
				create_time INTEGER NOT NULL DEFAULT (unixepoch()),
				FOREIGN KEY (event_id) REFERENCES events (id)
			)
		`);

		await client.execute(`
			CREATE TABLE IF NOT EXISTS channels (
				id INTEGER PRIMARY KEY,
				name VARCHAR(255) NOT NULL UNIQUE,
				create_time INTEGER NOT NULL DEFAULT (unixepoch())
			)
		`);

		await client.execute(`
			CREATE TABLE IF NOT EXISTS driver_list (
				racing_number INTEGER PRIMARY KEY,
				reference VARCHAR(255) NOT NULL,
				first_name VARCHAR(255) NOT NULL,
				last_name VARCHAR(255) NOT NULL,
				full_name VARCHAR(255) NOT NULL,
				broadcast_name VARCHAR(255) NOT NULL,
				tla VARCHAR(255) NOT NULL,
				team_name VARCHAR(255) NOT NULL,
				team_color VARCHAR(255) NOT NULL
			)
		`);

		await client.execute(`
			CREATE TABLE IF NOT EXISTS championship_standings (
				id INTEGER PRIMARY KEY,
				type INTEGER NOT NULL UNIQUE,
				data JSON NOT NULL,
				create_time INTEGER NOT NULL DEFAULT (unixepoch())
			)
		`);

		// Check if event types already exist
		const eventTypeCount = await client.execute(
			"SELECT COUNT(*) as count FROM event_type",
		);

		// Only insert event types if none exist
		if (eventTypeCount.rows[0].count === 0) {
			const eventTypes = [
				{ id: EventType.LiveryReveal, name: "Livery Reveal" },
				{ id: EventType.FreePractice1, name: "Practice 1" },
				{ id: EventType.FreePractice2, name: "Practice 2" },
				{ id: EventType.FreePractice3, name: "Practice 3" },
				{ id: EventType.Qualifying, name: "Qualifying" },
				{ id: EventType.Sprint, name: "Sprint" },
				{ id: EventType.Race, name: "Race" },
				{ id: EventType.SprintQualifying, name: "Sprint Qualifying" },
			];

			for (const type of eventTypes) {
				await client.execute({
					sql: "INSERT INTO event_type (id, name) VALUES (?, ?)",
					args: [type.id, type.name],
				});
			}
		}

		return client;
	} catch (error) {
		console.error(`Failed to initialize database: ${error}`);
		throw error;
	}
}

// Get or initialize the database instance
export async function getDb(): Promise<ReturnType<typeof createClient>> {
	if (!dbInstance) {
		dbInstance = await initDatabase();
	}
	return dbInstance;
}

export async function closeDb(): Promise<void> {
	if (dbInstance) {
		await dbInstance.close();
		dbInstance = null;
	}
}

// Store events in the database
export async function storeEvents(events: Event[]): Promise<void> {
	if (events.length === 0) return;

	try {
		const db = await getDb();

		for (const event of events) {
			await db.execute({
				sql: `INSERT INTO events (meeting_name, event_type_id, start_time, event_slug)
					VALUES (?, ?, ?, ?)
					ON CONFLICT(event_slug) DO UPDATE SET
						meeting_name = excluded.meeting_name,
						event_type_id = excluded.event_type_id,
						start_time = excluded.start_time`,
				args: [
					event.meetingName,
					event.eventTypeId,
					event.startTime,
					event.eventSlug,
				],
			});
		}

		console.log(`Stored ${events.length} events in the database`);
	} catch (error) {
		console.error(`Error storing events: ${error}`);
	}
}

// Store driver in the database
export async function storeDriver(driver: Driver): Promise<void> {
	try {
		const db = await getDb();
		await db.execute({
			sql: `INSERT INTO driver_list (
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
				team_color = excluded.team_color`,
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
		});
	} catch (error) {
		console.error(`Error storing driver: ${error}`);
	}
}

export async function getAllDrivers(): Promise<Driver[]> {
	try {
		const db = await getDb();
		const result = await db.execute(`
			SELECT 
				racing_number as racingNumber, 
				reference, 
				first_name as firstName, 
				last_name as lastName, 
				full_name as fullName, 
				broadcast_name as broadcastName, 
				tla, 
				team_name as teamName, 
				team_color as teamColor
			FROM driver_list
		`);

		return result.rows.map((row) => ({
			racingNumber: row.racingNumber as number,
			reference: row.reference as string,
			firstName: row.firstName as string,
			lastName: row.lastName as string,
			fullName: row.fullName as string,
			broadcastName: row.broadcastName as string,
			tla: row.tla as string,
			teamName: row.teamName as string,
			teamColor: row.teamColor as string,
		}));
	} catch (error) {
		console.error(`Error getting all drivers: ${error}`);
		return [];
	}
}

// Get the next event
export async function getNextEvent(eventType?: EventType): Promise<{
	meetingName: string;
	eventType: EventType;
	startTime: number;
} | null> {
	try {
		const db = await getDb();

		// Build query based on parameters
		let sql = `
			SELECT meeting_name, event_type_id, start_time
			FROM events
			WHERE start_time > unixepoch()
		`;
		const params: (string | number)[] = [];

		if (eventType) {
			sql += " AND event_type_id = ?";
			params.push(eventType);
		}

		sql += `
			ORDER BY start_time
			LIMIT 1
		`;

		console.log(`Executing query: ${sql} with params: ${params.join(", ")}`);

		const result = await db.execute({ sql, args: params });

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
		console.error(`Error getting next event: ${error}`);
		if (error instanceof Error) {
			console.error(`Error stack: ${error.stack}`);
		}
		return null;
	}
}

// Get the latest path
export async function getLatestPath(): Promise<string | null> {
	try {
		const db = await getDb();
		const result = await db.execute(
			"SELECT path FROM results ORDER BY create_time DESC LIMIT 1",
		);

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
		console.error(`Error getting latest path: ${error}`);
		return null;
	}
}

// Check if an event result has been delivered
export async function isEventDelivered(path: string): Promise<boolean> {
	try {
		const db = await getDb();
		const result = await db.execute({
			sql: "SELECT 1 FROM results WHERE path = ?",
			args: [path],
		});

		return result.rows.length > 0;
	} catch (error) {
		console.error(`Error checking if event is delivered: ${error}`);
		return false;
	}
}

// Add a channel to the database
export async function addChannel(channelName: string): Promise<void> {
	try {
		const db = await getDb();
		await db.execute({
			sql: "INSERT OR IGNORE INTO channels (name) VALUES (?)",
			args: [channelName],
		});
	} catch (error) {
		console.error(`Error adding channel: ${error}`);
	}
}

export async function getAllChannels(): Promise<string[]> {
	try {
		const db = await getDb();
		const result = await db.execute("SELECT name FROM channels");
		return result.rows.map((row) => row.name as string);
	} catch (error) {
		console.error(`Error getting all channels: ${error}`);
		return [];
	}
}

export async function storeEventResult(
	eventId: number,
	path: string,
	data: object,
): Promise<void> {
	try {
		const db = await getDb();
		await db.execute({
			sql: "INSERT INTO results (event_id, path, data) VALUES (?, ?, json(?))",
			args: [eventId, path, JSON.stringify(data)],
		});
	} catch (error) {
		console.error(`Error storing event result: ${error}`);
	}
}

// Get event by slug
export async function getEventBySlug(slug: string): Promise<DbEvent | null> {
	try {
		const db = await getDb();
		const result = await db.execute({
			sql: "SELECT id, meeting_name, event_type_id, start_time FROM events WHERE event_slug = ?",
			args: [slug],
		});

		if (result.rows.length === 0) {
			return null;
		}

		const row = result.rows[0];
		return {
			id: row.id as number,
			meetingName: row.meeting_name as string,
			eventTypeId: row.event_type_id as EventType,
			startTime: row.start_time as number,
		};
	} catch (error) {
		console.error(`Error getting event by slug: ${error}`);
		return null;
	}
}

// Get event type name
export async function getEventTypeName(
	eventTypeId: EventType,
): Promise<string> {
	try {
		const db = await getDb();
		const result = await db.execute({
			sql: "SELECT name FROM event_type WHERE id = ?",
			args: [eventTypeId],
		});

		return result.rows.length > 0 ? (result.rows[0].name as string) : "Unknown";
	} catch (error) {
		console.error(`Error getting event type name: ${error}`);
		return "Unknown";
	}
}

export async function storeChampionshipStandings(
	type: number,
	data: object,
): Promise<void> {
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
		console.error(`Error storing championship standings: ${error}`);
	}
}

// Get championship standings
export async function getChampionshipStandings(
	type: number,
): Promise<object | null> {
	try {
		const db = await getDb();
		const result = await db.execute({
			sql: "SELECT data FROM championship_standings WHERE type = ? LIMIT 1",
			args: [type],
		});

		return result.rows.length > 0
			? JSON.parse(result.rows[0].data as string)
			: null;
	} catch (error) {
		console.error(`Error getting championship standings: ${error}`);
		return null;
	}
}

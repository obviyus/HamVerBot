import { Database } from "bun:sqlite";
import { readCurrentEvent } from "~/fetch";

export enum EventType {
	LiveryReveal = 1,
	FreePractice1 = 2,
	FreePractice2 = 3,
	FreePractice3 = 4,
	Qualifying = 5,
	Sprint = 6,
	Race = 7,
	SprintQualifying = 8,
}

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

// Default database path
const DEFAULT_DB_PATH = "./HamVerBot.db";

// Single database instance
let dbInstance: Database | null = null;

// Prepared statements cache
const preparedStatements: Record<string, ReturnType<Database["prepare"]>> = {};

// Function to initialize the database
export function initDatabase(dbPath = DEFAULT_DB_PATH): Database {
	try {
		const db = new Database(dbPath);

		// Enable foreign keys
		db.exec("PRAGMA foreign_keys = ON");

		// Create tables if they don't exist
		db.exec(`
    CREATE TABLE IF NOT EXISTS event_type (
      id INTEGER PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE
    );
    
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_name VARCHAR(255) NOT NULL,
      event_type_id INTEGER NOT NULL,
      start_time INTEGER NOT NULL,
      event_slug VARCHAR(255) NOT NULL UNIQUE,
      FOREIGN KEY (event_type_id) REFERENCES event_type (id)
    );
    
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      path VARCHAR(255) NOT NULL UNIQUE,
      data JSON NOT NULL,
      create_time INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (event_id) REFERENCES events (id)
    );
    
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(255) NOT NULL UNIQUE,
      create_time INTEGER NOT NULL DEFAULT (unixepoch())
    );

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
    );

    CREATE TABLE IF NOT EXISTS championship_standings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type INTEGER NOT NULL UNIQUE,
      data JSON NOT NULL,
      create_time INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

		// Check if event types already exist
		const eventTypeCount = db
			.query("SELECT COUNT(*) as count FROM event_type")
			.get() as { count: number };

		// Only insert event types if none exist
		if (eventTypeCount.count === 0) {
			// Insert event types
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

			const stmt = db.prepare(
				"INSERT INTO event_type (id, name) VALUES (?, ?)",
			);
			for (const type of eventTypes) {
				stmt.run(type.id, type.name);
			}
		}

		return db;
	} catch (error) {
		console.error(`Failed to initialize database: ${error}`);
		throw error;
	}
}

// Get a prepared statement or create one if it doesn't exist
function getPreparedStatement(db: Database, key: string, sql: string) {
	if (!preparedStatements[key]) {
		preparedStatements[key] = db.prepare(sql);
	}
	return preparedStatements[key];
}

// Get or initialize the database instance
export function getDb(dbPath = DEFAULT_DB_PATH): Database {
	if (!dbInstance) {
		dbInstance = initDatabase(dbPath);
	}
	return dbInstance;
}

export function closeDb(): void {
	if (dbInstance) {
		// Clear prepared statements cache
		for (const key in preparedStatements) {
			delete preparedStatements[key];
		}

		dbInstance.close();
		dbInstance = null;
	}
}

// Store events in the database using a transaction for better performance
export function storeEvents(events: Event[]): void {
	if (events.length === 0) return;

	try {
		const db = getDb();
		const stmt = getPreparedStatement(
			db,
			"storeEvents",
			`INSERT INTO events (meeting_name, event_type_id, start_time, event_slug)
			VALUES (?, ?, ?, ?)
			ON CONFLICT(event_slug) DO UPDATE SET
				meeting_name = excluded.meeting_name,
				event_type_id = excluded.event_type_id,
				start_time = excluded.start_time`,
		);

		// Use transaction for batch operations
		db.transaction(() => {
			for (const event of events) {
				stmt.run(
					event.meetingName,
					event.eventTypeId,
					event.startTime,
					event.eventSlug,
				);
			}
		})();

		console.log(`Stored ${events.length} events in the database`);
	} catch (error) {
		console.error(`Error storing events: ${error}`);
	}
}

// Store driver in the database
export function storeDriver(driver: Driver): void {
	try {
		const db = getDb();
		const stmt = getPreparedStatement(
			db,
			"storeDriver",
			`INSERT INTO driver_list (
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
		);

		stmt.run(
			driver.racingNumber,
			driver.reference,
			driver.firstName,
			driver.lastName,
			driver.fullName,
			driver.broadcastName,
			driver.tla,
			driver.teamName,
			driver.teamColor,
		);
	} catch (error) {
		console.error(`Error storing driver: ${error}`);
	}
}

export function getAllDrivers(): Driver[] {
	try {
		const db = getDb();
		const stmt = getPreparedStatement(
			db,
			"getAllDrivers",
			`SELECT 
				racing_number as racingNumber, 
				reference, 
				first_name as firstName, 
				last_name as lastName, 
				full_name as fullName, 
				broadcast_name as broadcastName, 
				tla, 
				team_name as teamName, 
				team_color as teamColor
			FROM driver_list`,
		);

		return stmt.all() as Driver[];
	} catch (error) {
		console.error(`Error getting all drivers: ${error}`);
		return [];
	}
}

// Get the next event
export function getNextEvent(
	eventType?: EventType,
): { meetingName: string; eventType: EventType; startTime: number } | null {
	try {
		const db = getDb();

		// Build query based on parameters
		let query = `
			SELECT meeting_name, event_type_id, start_time
			FROM events
			WHERE start_time > unixepoch()
		`;

		const params: EventType[] = [];

		if (eventType) {
			query += " AND event_type_id = ?";
			params.push(eventType);
		}

		query += `
			ORDER BY start_time
			LIMIT 1
		`;

		console.log(`Executing query: ${query} with params: ${params.join(", ")}`);

		const result = db.query(query).get(...params) as {
			meeting_name: string;
			event_type_id: number;
			start_time: number;
		} | null;

		if (!result) {
			console.log("No upcoming events found in database query");
			return null;
		}

		return {
			meetingName: result.meeting_name,
			eventType: result.event_type_id as EventType,
			startTime: result.start_time,
		};
	} catch (error) {
		console.error(`Error getting next event: ${error}`);
		// Add more detailed error information
		if (error instanceof Error) {
			console.error(`Error stack: ${error.stack}`);
		}
		return null;
	}
}

// Get the latest path
export async function getLatestPath(): Promise<string | null> {
	try {
		const db = getDb();
		const stmt = getPreparedStatement(
			db,
			"getLatestPath",
			"SELECT path FROM results ORDER BY create_time DESC LIMIT 1",
		);

		const result = stmt.get() as { path: string } | null;
		if (!result) {
			const { path, isComplete } = await readCurrentEvent();
			if (isComplete) {
				return path;
			}
		}

		return result ? result.path : null;
	} catch (error) {
		console.error(`Error getting latest path: ${error}`);
		return null;
	}
}

// Check if an event result has been delivered
export function isEventDelivered(path: string): boolean {
	try {
		const db = getDb();
		const stmt = getPreparedStatement(
			db,
			"isEventDelivered",
			"SELECT 1 FROM results WHERE path = ?",
		);

		const result = stmt.get(path) as { 1: number } | null;
		return !!result;
	} catch (error) {
		console.error(`Error checking if event is delivered: ${error}`);
		return false;
	}
}

// Add a channel to the database
export function addChannel(channelName: string): void {
	try {
		const db = getDb();
		const stmt = getPreparedStatement(
			db,
			"addChannel",
			"INSERT OR IGNORE INTO channels (name) VALUES (?)",
		);

		stmt.run(channelName);
	} catch (error) {
		console.error(`Error adding channel: ${error}`);
	}
}

export function getAllChannels(): string[] {
	try {
		const db = getDb();
		const stmt = getPreparedStatement(
			db,
			"getAllChannels",
			"SELECT name FROM channels",
		);

		const results = stmt.all() as { name: string }[];
		return results.map((row) => row.name);
	} catch (error) {
		console.error(`Error getting all channels: ${error}`);
		return [];
	}
}

export function storeEventResult(
	eventId: number,
	path: string,
	data: object,
): void {
	try {
		const db = getDb();
		const stmt = getPreparedStatement(
			db,
			"storeEventResult",
			"INSERT INTO results (event_id, path, data) VALUES (?, ?, json(?))",
		);

		stmt.run(eventId, path, JSON.stringify(data));
	} catch (error) {
		console.error(`Error storing event result: ${error}`);
	}
}

// Get event by slug
export function getEventBySlug(slug: string): DbEvent | null {
	try {
		const db = getDb();
		const stmt = getPreparedStatement(
			db,
			"getEventBySlug",
			"SELECT id, meeting_name, event_type_id, start_time FROM events WHERE event_slug = ?",
		);

		const result = stmt.get(slug) as {
			id: number;
			meeting_name: string;
			event_type_id: number;
			start_time: number;
		} | null;

		if (!result) {
			return null;
		}

		return {
			id: result.id,
			meetingName: result.meeting_name,
			eventTypeId: result.event_type_id as EventType,
			startTime: result.start_time,
		};
	} catch (error) {
		console.error(`Error getting event by slug: ${error}`);
		return null;
	}
}

// Get event type name
export function getEventTypeName(eventTypeId: EventType): string {
	try {
		const db = getDb();
		const stmt = getPreparedStatement(
			db,
			"getEventTypeName",
			"SELECT name FROM event_type WHERE id = ?",
		);

		const result = stmt.get(eventTypeId) as { name: string } | null;
		return result ? result.name : "Unknown";
	} catch (error) {
		console.error(`Error getting event type name: ${error}`);
		return "Unknown";
	}
}

export function storeChampionshipStandings(type: number, data: object): void {
	try {
		const db = getDb();
		const stmt = getPreparedStatement(
			db,
			"storeChampionshipStandings",
			`INSERT INTO championship_standings (type, data) 
			VALUES (?, json(?)) 
			ON CONFLICT(type) DO UPDATE SET 
				data = json(excluded.data), 
				create_time = unixepoch()`,
		);

		stmt.run(type, JSON.stringify(data));
	} catch (error) {
		console.error(`Error storing championship standings: ${error}`);
	}
}

// Get championship standings
export function getChampionshipStandings(type: number): object | null {
	try {
		const db = getDb();
		const stmt = getPreparedStatement(
			db,
			"getChampionshipStandings",
			"SELECT data FROM championship_standings WHERE type = ? LIMIT 1",
		);

		const result = stmt.get(type) as { data: string } | null;
		return result ? JSON.parse(result.data) : null;
	} catch (error) {
		console.error(`Error getting championship standings: ${error}`);
		return null;
	}
}

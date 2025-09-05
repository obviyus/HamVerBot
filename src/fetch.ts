import {
	getDb,
	getEventTypeName,
	getNextEvent,
	storeChampionshipStandings,
	storeDriver,
	storeEventResult,
} from "~/database";
import type {
	ConstructorMRData,
	CurrentConstructorStandings,
	CurrentDriverStandings,
	Driver,
	DriverMRData,
	DriverStanding,
	SessionResults,
} from "~/types/models";
import { sessionKeyToEventType } from "~/utils/events";

// API endpoints
const F1_SESSION_ENDPOINT = "https://livetiming.formula1.com/static";
const ERGAST_API_ENDPOINT = "https://api.jolpi.ca/ergast/f1";

/**
 * Generic function to fetch JSON data from an API with improved error handling
 */
async function fetchJson<T>(url: string, headers?: HeadersInit): Promise<T> {
	try {
		// Use Bun's native fetch capability
		const response = await fetch(url, {
			headers,
			// Add timeout to prevent hanging requests
			signal: AbortSignal.timeout(10000),
		});

		if (!response.ok) {
			throw new Error(`HTTP error! Status: ${response.status} for URL: ${url}`);
		}

		const text = await response.text();

		// Remove BOM character if present
		const cleanText = text.trim().replace(/^\uFEFF/, "");

		return JSON.parse(cleanText) as T;
	} catch (error) {
		console.error(`Error fetching data from ${url}:`, error);
		throw error;
	}
}

/**
 * Fetch driver list from F1 API and store in database
 */
export async function fetchDriverList(path: string): Promise<void> {
	console.log(`Fetching driver list for ${path}...`);
	const driverListUrl = `${F1_SESSION_ENDPOINT}/${path}DriverList.json`;

	try {
		// The API response is an object where keys are racing numbers and values are driver data
		const response =
			await fetchJson<
				Record<
					string,
					{
						RacingNumber: string;
						Reference: string;
						FirstName: string;
						LastName: string;
						FullName: string;
						BroadcastName: string;
						Tla: string;
						TeamName: string;
						TeamColour: string;
					}
				>
			>(driverListUrl);

		// Get all driver entries and process them in a single batch
		const drivers: Driver[] = Object.values(response).map((driverData) => ({
			racingNumber: Number.parseInt(driverData.RacingNumber, 10),
			reference: driverData.Reference || "",
			firstName: driverData.FirstName || "",
			lastName: driverData.LastName || "",
			fullName: driverData.FullName || "",
			broadcastName: driverData.BroadcastName || "",
			tla: driverData.Tla || "",
			teamName: driverData.TeamName || "",
			teamColor: driverData.TeamColour || "#FFFFFF",
		}));

		// Store drivers in database
		let driversProcessed = 0;
		for (const driver of drivers) {
			try {
				storeDriver(driver);
				driversProcessed++;
			} catch (error) {
				console.error(`Error storing driver ${driver.fullName}:`, error);
			}
		}

		console.log(`Successfully processed ${driversProcessed} drivers`);
	} catch (error) {
		console.error("Error fetching or processing driver list:", error);
	}
}

/**
 * Read current event information from F1 API
 */
export async function readCurrentEvent(): Promise<{
	path: string;
	isComplete: boolean;
}> {
	try {
		const response = await fetchJson<{
			ArchiveStatus: {
				Status: string;
			};
			Path: string;
		}>(`${F1_SESSION_ENDPOINT}/SessionInfo.json`);

		return {
			path: response.Path,
			isComplete: response.ArchiveStatus.Status === "Complete",
		};
	} catch (error) {
		console.error("Error reading current event:", error);
		throw error;
	}
}

interface TimingLine {
	Position?: string;
	RacingNumber?: string;
	BestLapTime?: {
		Value?: string;
	};
	Stats?: Array<{
		TimeDifftoPositionAhead?: string;
	}>;
}

/**
 * Extract driver position and timing data from F1 API response
 */
async function extractPositionAndTiming(
	data: Record<string, unknown>,
): Promise<DriverStanding[]> {
	const lines = data.Lines as Record<string, TimingLine>;
	if (!lines) {
		throw new Error("Failed to extract lines from timing data");
	}

	const db = await getDb();

	// Get all drivers from the database in a single query
	const result = await db.execute(`
		SELECT racing_number, tla, team_name 
		FROM driver_list
	`);

	const drivers = result.rows.map((row) => ({
		racing_number: row.racing_number as number,
		tla: row.tla as string,
		team_name: row.team_name as string,
	}));

	const standings: DriverStanding[] = [];

	// Pre-create lookup map for faster driver lookup by racing number
	const driversMap = new Map(drivers.map((d) => [d.racing_number, d]));

	for (const [_, driverData] of Object.entries(lines)) {
		if (!driverData.Position || !driverData.RacingNumber) {
			continue;
		}

		const position = Number.parseInt(driverData.Position, 10);
		const racingNumber = Number.parseInt(driverData.RacingNumber, 10);

		// Find the driver using the lookup map
		const driver = driversMap.get(racingNumber);
		if (!driver) {
			console.warn(
				`Driver with racing number ${racingNumber} not found in database`,
			);
			continue;
		}

		// Get best lap time
		const bestLapTime = driverData.BestLapTime?.Value || "";

		// Get interval to position ahead
		let difference: string | undefined;
		if (driverData.Stats && Array.isArray(driverData.Stats)) {
			const timeDiff = driverData.Stats.find(
				(stat) => stat.TimeDifftoPositionAhead !== undefined,
			);
			if (timeDiff) {
				difference = timeDiff.TimeDifftoPositionAhead;
			}
		}

		standings.push({
			position,
			driverName: driver.tla,
			teamName: driver.team_name,
			time: bestLapTime,
			difference,
		});
	}

	// Sort by position
	return standings.sort((a, b) => a.position - b.position);
}

/**
 * Fetch results for a given path from the F1 API
 */
export async function fetchResults(path: string): Promise<string> {
	console.log(`Fetching results for ${path}...`);
	const db = await getDb();

	try {
		// First get the event_id and event_type from the results and events tables
		const eventQuery = `
			SELECT e.meeting_name, et.name as event_type_name, r.data
			FROM results r
			JOIN events e ON r.event_id = e.id
			JOIN event_type et ON e.event_type_id = et.id
			WHERE r.path = ?
			LIMIT 1
		`;

		const result = await db.execute({
			sql: eventQuery,
			args: [path],
		});

		let sessionResult: SessionResults;

		if (result.rows.length > 0) {
			console.log(`Using cached results for ${path}`);
			try {
				const row = result.rows[0];
				const data = JSON.parse(row.data as string) as SessionResults;

				// Update the title to include the event type from the database
				sessionResult = {
					...data,
					title: `${row.meeting_name}: ${row.event_type_name}`,
				};
			} catch (parseError) {
				console.error(
					"Error parsing cached results, fetching fresh data:",
					parseError,
				);
				sessionResult = await fetchFreshResults(path);
			}
		} else {
			sessionResult = await fetchFreshResults(path);
		}

		return formatResultsOutput(sessionResult);
	} catch (error) {
		console.error("Error fetching results:", error);
		return `Error fetching results: ${error instanceof Error ? error.message : "Unknown error"}`;
	}
}

/**
 * Fetch fresh results from the F1 API
 */
async function fetchFreshResults(path: string): Promise<SessionResults> {
	// Fetch timing data
	console.log(`Fetching TimingDataF1 for ${path}...`);
	const timingData = await fetchJson<Record<string, unknown>>(
		`${F1_SESSION_ENDPOINT}/${path}TimingDataF1.json`,
	);

	// Fetch session info
	console.log("Fetching SessionInfo...");
	const sessionInfoResponse = await fetchJson<{
		Meeting: {
			OfficialName: string;
			Name: string;
		};
	}>(`${F1_SESSION_ENDPOINT}/SessionInfo.json`);

	// Extract driver standings
	const standings = await extractPositionAndTiming(timingData);

	// Extract session type from path
	const sanitizedPath = path.replace(/\/+$/, "");
	const lastSegment = sanitizedPath.split("/").filter(Boolean).pop() ?? "";
	const rawKey = lastSegment.split("_").pop() ?? "";
	const sessionKey = rawKey.toLowerCase();
	const eventType = sessionKey ? sessionKeyToEventType(sessionKey) : null;
	// Prefer DB's canonical event type name ("Practice 1") over utils ("Free Practice 1")
	const sessionName =
		eventType !== null ? await getEventTypeName(eventType) : "";

	// Create session result with session type (using only OfficialName)
	const sessionResult: SessionResults = {
		title: `${sessionInfoResponse.Meeting.OfficialName}${sessionName ? `: ${sessionName}` : ""}`,
		standings,
	};

	const db = await getDb();
	// Try to store results against the correct event (matching meeting name and type)
	try {
		if (eventType !== null) {
			const exact = await db.execute({
				sql: "SELECT id FROM events WHERE meeting_name = ? AND event_type_id = ? LIMIT 1",
				args: [sessionInfoResponse.Meeting.OfficialName, eventType],
			});
			if (exact.rows.length > 0) {
				await storeEventResult(exact.rows[0].id as number, path, sessionResult);
			} else {
				// Fallback: try by meeting name only (closest by start time could be added later)
				const byName = await db.execute({
					sql: "SELECT id FROM events WHERE meeting_name = ? LIMIT 1",
					args: [sessionInfoResponse.Meeting.OfficialName],
				});
				if (byName.rows.length > 0) {
					await storeEventResult(
						byName.rows[0].id as number,
						path,
						sessionResult,
					);
				} else {
					console.warn(
						"Could not find matching event to store results for",
						sessionInfoResponse.Meeting.OfficialName,
						eventType,
					);
				}
			}
		} else {
			console.warn(
				"Unknown session type in path, skipping result storage for:",
				path,
			);
		}
	} catch (e) {
		console.error("Error while storing event result: ", e);
	}

	return sessionResult;
}

/**
 * Format session results for output
 */
function formatResultsOutput(sessionResult: SessionResults): string {
	let output = `🏎️ \x02${sessionResult.title} Results\x02:`;

	// Take only the top 10 drivers to avoid spamming
	const topDrivers = sessionResult.standings.slice(0, 10);

	for (const standing of topDrivers) {
		output += ` ${standing.position}. ${standing.driverName} - \x0303[${standing.time}]\x03`;
	}

	return output;
}

/**
 * Generic function to fetch standings (WCC or WDC)
 * @param type 0 for WDC, 1 for WCC
 * @param url API endpoint URL
 * @param formatFn Function to format the standings
 */
async function fetchStandings<T extends object>(
	type: number,
	url: string,
	formatFn: (data: T) => string,
): Promise<string | null> {
	console.log(`Fetching standings of type ${type}...`);
	const db = await getDb();

	try {
		// Check if we already have standings in the database
		const result = await db.execute({
			sql: "SELECT data FROM championship_standings WHERE type = ? LIMIT 1",
			args: [type],
		});

		let standings: T;

		// If we have standings, use them, otherwise fetch new ones
		if (result.rows.length > 0) {
			try {
				standings = JSON.parse(result.rows[0].data as string) as T;
			} catch (error) {
				console.error(
					"Error parsing cached standings, fetching fresh data:",
					error,
				);
				const response = await fetchJson<{ MRData: unknown }>(url);
				standings = { MRData: response.MRData } as T;
				await storeChampionshipStandings(type, standings);
			}
		} else {
			const response = await fetchJson<{ MRData: unknown }>(url);
			standings = { MRData: response.MRData } as T;
			await storeChampionshipStandings(type, standings);
		}

		return formatFn(standings);
	} catch (error) {
		console.error(`Error fetching standings of type ${type}:`, error);
		return null;
	}
}

/**
 * Fetch current WCC standings from Ergast API
 */
export async function fetchWccStandings(): Promise<CurrentConstructorStandings | null> {
	console.log("Fetching WCC standings...");
	try {
		const response = await fetchJson<{ MRData: ConstructorMRData }>(
			`${ERGAST_API_ENDPOINT}/current/constructorstandings/?format=json`,
		);

		// Convert API response to our model
		const standings: CurrentConstructorStandings = {
			MRData: response.MRData,
		};

		// Store the standings in the database
		storeChampionshipStandings(1, standings);

		return standings;
	} catch (error) {
		console.error("Error fetching WCC standings:", error);
		return null;
	}
}

/**
 * Fetch current WDC standings from Ergast API
 */
export async function fetchWdcStandings(): Promise<CurrentDriverStandings | null> {
	console.log("Fetching WDC standings...");
	try {
		const response = await fetchJson<{ MRData: DriverMRData }>(
			`${ERGAST_API_ENDPOINT}/current/driverstandings/?format=json`,
		);

		// Convert API response to our model
		const standings: CurrentDriverStandings = {
			MRData: response.MRData,
		};

		// Store the standings in the database
		storeChampionshipStandings(0, standings);

		return standings;
	} catch (error) {
		console.error("Error fetching WDC standings:", error);
		return null;
	}
}

/**
 * Format WCC standings for output
 */
function formatWccStandings(standings: CurrentConstructorStandings): string {
	// Format the standings for output
	let output = `🔧 \x02FORMULA 1 ${standings.MRData.StandingsTable.season} WCC Standings\x02:`;

	// Get the first standings list
	const standingsList = standings.MRData.StandingsTable.StandingsLists[0];

	// Take only the top 10 constructors to avoid spamming
	const topConstructors = standingsList.ConstructorStandings.slice(0, 10);

	for (const standing of topConstructors) {
		output += ` ${standing.position}. ${standing.Constructor.name} - \x0303[${standing.points}]\x03`;
	}

	return output;
}

/**
 * Format WDC standings for output
 */
function formatWdcStandings(standings: CurrentDriverStandings): string {
	// Format the standings for output
	let output = `🏆 \x02FORMULA 1 ${standings.MRData.StandingsTable.season} WDC Standings\x02:`;

	// Get the first standings list
	const standingsList = standings.MRData.StandingsTable.StandingsLists[0];

	// Take only the top 10 drivers to avoid spamming
	const topDrivers = standingsList.DriverStandings.slice(0, 10);

	for (const standing of topDrivers) {
		output += ` ${standing.position}. ${standing.Driver.code} - \x0303[${standing.points}]\x03`;
	}

	return output;
}

/**
 * Get current WCC standings
 */
export async function returnWccStandings(): Promise<string | null> {
	return fetchStandings<CurrentConstructorStandings>(
		1,
		`${ERGAST_API_ENDPOINT}/current/constructorstandings/?format=json`,
		formatWccStandings,
	);
}

/**
 * Get current WDC standings
 */
export async function returnWdcStandings(): Promise<string | null> {
	return fetchStandings<CurrentDriverStandings>(
		0,
		`${ERGAST_API_ENDPOINT}/current/driverstandings/?format=json`,
		formatWdcStandings,
	);
}

/**
 * Fetch the next closest event from the database
 */
export async function fetchNextEvent(): Promise<string | null> {
	console.log("Checking for upcoming events...");

	try {
		// Get the next event from the database
		const nextEvent = await getNextEvent();
		if (!nextEvent) {
			console.log("No upcoming events found in database");
			return null;
		}

		const { meetingName, eventType, startTime } = nextEvent;
		console.log(
			`Found upcoming event: ${meetingName}, type: ${eventType}, time: ${new Date(startTime * 1000).toISOString()}`,
		);

		// Convert Unix timestamp to Date
		const eventDate = new Date(startTime * 1000);

		const timeToEventMinutes = Math.floor(
			(eventDate.getTime() - Date.now()) / (1000 * 60),
		);
		console.log(`Time to event: ${timeToEventMinutes} minutes`);

		// Only notify if the event is starting in the next 5 minutes
		if (timeToEventMinutes > 0 && timeToEventMinutes <= 5) {
			// Get the event type name
			const eventTypeName = await getEventTypeName(eventType);
			console.log(
				`Event starting soon! Preparing notification for ${meetingName}: ${eventTypeName}`,
			);
			return `🏎️ \x02${meetingName}: ${eventTypeName}\x02 begins in 5 minutes.`;
		}

		console.log(
			`Event not starting soon (${timeToEventMinutes} minutes away), no notification needed`,
		);
		return null;
	} catch (error) {
		console.error("Error fetching next event:", error);
		return null;
	}
}

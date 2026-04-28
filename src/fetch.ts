import {
	getDb,
	getEventTypeName,
	getNextEvent,
	storeChampionshipStandings,
	storeDrivers,
	storeEventResult,
} from "~/database";
import type {
	ConstructorMRData,
	Driver,
	DriverMRData,
	DriverStanding,
	SessionResults,
} from "~/types/models";
import { sessionKeyToEventType, stringToEventType } from "~/utils/events";

type CurrentConstructorStandings = { MRData: ConstructorMRData };
type CurrentDriverStandings = { MRData: DriverMRData };

const F1_SESSION_ENDPOINT = "https://livetiming.formula1.com/static";
const ERGAST_API_ENDPOINT = "https://api.jolpi.ca/ergast/f1";
const SESSION_KEY_ALIASES: Record<string, string> = {
	practice1: "fp1",
	practice2: "fp2",
	practice3: "fp3",
	sprintshootout: "sprintqualifying",
	sprintshootoutqualifying: "sprintqualifying",
};

async function fetchJson<T>(url: string): Promise<T> {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(10000),
	});

	if (!response.ok) {
		throw new Error(`HTTP error! Status: ${response.status} for URL: ${url}`);
	}

	const text = await response.text();
	const cleanText = text.trim().replace(/^\uFEFF/, "");
	return JSON.parse(cleanText) as T;
}

export async function fetchDriverList(path: string): Promise<void> {
	console.log(`Fetching driver list for ${path}...`);

	try {
		const response = await fetchJson<
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
		>(`${F1_SESSION_ENDPOINT}/${path}DriverList.json`);

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

		await storeDrivers(drivers);
		console.log(`Successfully processed ${drivers.length} drivers`);
	} catch (error) {
		console.error("Error fetching or processing driver list:", error);
	}
}

export async function readCurrentEvent(): Promise<{
	path: string;
	isComplete: boolean;
}> {
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

interface SessionResultEntry {
	position: string;
	Driver: {
		code?: string;
	};
}

interface RaceTableResponse<T> {
	MRData: {
		RaceTable: {
			season: string;
			Races: T[];
		};
	};
}

export async function fetchResults(path: string): Promise<string> {
	console.log(`Fetching results for ${path}...`);
	const db = await getDb();

	try {
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
				if (typeof row.meeting_name !== "string" || typeof row.event_type_name !== "string") {
					throw new Error("Cached result metadata is invalid");
				}
				const data = JSON.parse(row.data as string) as SessionResults;
				sessionResult = {
					...data,
					title: `${row.meeting_name}: ${row.event_type_name}`,
				};
			} catch (parseError) {
				console.error("Error parsing cached results, fetching fresh data:", parseError);
				sessionResult = await fetchFreshResults(path);
			}
		} else {
			sessionResult = await fetchFreshResults(path);
		}

		let output = `🏎️ \x02${sessionResult.title} Results\x02:`;
		for (const standing of sessionResult.standings.slice(0, 10)) {
			output += ` ${standing.position}. ${standing.driverName} - \x0303[${standing.time}]\x03`;
		}
		return output;
	} catch (error) {
		console.error("Error fetching results:", error);
		return `Error fetching results: ${error instanceof Error ? error.message : "Unknown error"}`;
	}
}

async function fetchFreshResults(path: string): Promise<SessionResults> {
	console.log(`Fetching TimingDataF1 for ${path}...`);
	const timingData = await fetchJson<Record<string, unknown>>(
		`${F1_SESSION_ENDPOINT}/${path}TimingDataF1.json`,
	);

	console.log("Fetching SessionInfo...");
	const sessionInfoResponse = await fetchJson<{
		Meeting: {
			OfficialName: string;
		};
	}>(`${F1_SESSION_ENDPOINT}/SessionInfo.json`);

	const lines = timingData.Lines as Record<string, TimingLine>;
	if (!lines) {
		throw new Error("Failed to extract lines from timing data");
	}

	const driverList = await getDb().then((db) =>
		db.execute(`
			SELECT racing_number, tla, team_name 
			FROM driver_list
		`),
	);
	const driversMap = new Map(
		driverList.rows.map((row) => [row.racing_number as number, { tla: row.tla as string, team_name: row.team_name as string }]),
	);
	const standings: DriverStanding[] = [];
	for (const driverData of Object.values(lines)) {
		if (!driverData.Position || !driverData.RacingNumber) {
			continue;
		}

		const position = Number.parseInt(driverData.Position, 10);
		const racingNumber = Number.parseInt(driverData.RacingNumber, 10);
		const driver = driversMap.get(racingNumber);
		if (!driver) {
			console.warn(`Driver with racing number ${racingNumber} not found in database`);
			continue;
		}

		let difference: string | undefined;
		if (driverData.Stats && Array.isArray(driverData.Stats)) {
			difference = driverData.Stats.find((stat) => stat.TimeDifftoPositionAhead !== undefined)
				?.TimeDifftoPositionAhead;
		}

		standings.push({
			position,
			driverName: driver.tla,
			teamName: driver.team_name,
			time: driverData.BestLapTime?.Value || "",
			difference,
		});
	}
	standings.sort((a, b) => a.position - b.position);
	const lastSegment = path.replace(/\/+$/, "").split("/").filter(Boolean).at(-1) ?? "";
	const normalizedKey = lastSegment
		.split("_")
		.filter(Boolean)
		.filter((part, index) => !(index === 0 && /^\d{4}-\d{2}-\d{2}$/.test(part)))
		.join("")
		.toLowerCase();
	const sessionKey = SESSION_KEY_ALIASES[normalizedKey] || normalizedKey;

	let eventType = sessionKey ? sessionKeyToEventType(sessionKey) : null;
	if (eventType === null && sessionKey) {
		const fallback = stringToEventType(sessionKey);
		eventType = typeof fallback === "number" ? fallback : null;
	}
	const meetingName = sessionInfoResponse.Meeting.OfficialName;
	const sessionName = eventType !== null ? await getEventTypeName(eventType) : "";
	const sessionResult: SessionResults = {
		title: `${meetingName}${sessionName ? `: ${sessionName}` : ""}`,
		standings,
	};

	const db = await getDb();
	try {
		if (eventType === null) {
			console.warn("Unknown session type in path, skipping result storage for:", path);
		} else {
			const exact = await db.execute({
				sql: "SELECT id FROM events WHERE meeting_name = ? AND event_type_id = ? LIMIT 1",
				args: [meetingName, eventType],
			});
			const eventId =
				exact.rows[0]?.id ??
				(await db.execute({
					sql: "SELECT id FROM events WHERE meeting_name = ? LIMIT 1",
					args: [meetingName],
				})).rows[0]?.id;
			if (eventId) {
				await storeEventResult(eventId as number, path, sessionResult);
			} else {
				console.warn("Could not find matching event to store results for", meetingName, eventType);
			}
		}
	} catch (e) {
		console.error("Error while storing event result: ", e);
	}

	return sessionResult;
}

async function fetchStandings<T extends object>(
	type: number,
	url: string,
	formatFn: (data: T) => string,
): Promise<string | null> {
	console.log(`Fetching standings of type ${type}...`);
	const db = await getDb();

	try {
		const result = await db.execute({
			sql: "SELECT data FROM championship_standings WHERE type = ? LIMIT 1",
			args: [type],
		});

		let standings: T | undefined;
		if (result.rows.length > 0) {
			try {
				standings = JSON.parse(result.rows[0].data as string) as T;
			} catch (error) {
				console.error("Error parsing cached standings, fetching fresh data:", error);
			}
		}
		if (!standings) {
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

async function fetchCurrentStandings<T extends ConstructorMRData | DriverMRData>(
	type: number,
	label: "WCC" | "WDC",
	url: string,
): Promise<{ MRData: T } | null> {
	console.log(`Fetching ${label} standings...`);
	try {
		const standings = { MRData: (await fetchJson<{ MRData: T }>(url)).MRData };
		await storeChampionshipStandings(type, standings);
		return standings;
	} catch (error) {
		console.error(`Error fetching ${label} standings:`, error);
		return null;
	}
}

export async function fetchWccStandings(): Promise<CurrentConstructorStandings | null> {
	return fetchCurrentStandings(1, "WCC", `${ERGAST_API_ENDPOINT}/current/constructorstandings/?format=json`);
}

export async function fetchWdcStandings(): Promise<CurrentDriverStandings | null> {
	return fetchCurrentStandings(0, "WDC", `${ERGAST_API_ENDPOINT}/current/driverstandings/?format=json`);
}

export async function returnWccStandings(): Promise<string | null> {
	return fetchStandings<CurrentConstructorStandings>(
		1,
		`${ERGAST_API_ENDPOINT}/current/constructorstandings/?format=json`,
		(standings) => {
			let output = `🔧 \x02FORMULA 1 ${standings.MRData.StandingsTable.season} WCC Standings\x02:`;
			const standingsList = standings.MRData.StandingsTable.StandingsLists[0];
			if (!standingsList) {
				return `No constructor standings yet for the ${standings.MRData.StandingsTable.season} season.`;
			}

			for (const standing of standingsList.ConstructorStandings.slice(0, 10)) {
				output += ` ${standing.position}. ${standing.Constructor.name} - \x0303[${standing.points}]\x03`;
			}

			return output;
		},
	);
}

export async function returnWdcStandings(): Promise<string | null> {
	return fetchStandings<CurrentDriverStandings>(
		0,
		`${ERGAST_API_ENDPOINT}/current/driverstandings/?format=json`,
		(standings) => {
			let output = `🏆 \x02FORMULA 1 ${standings.MRData.StandingsTable.season} WDC Standings\x02:`;
			const standingsList = standings.MRData.StandingsTable.StandingsLists[0];
			if (!standingsList) {
				return `No driver standings yet for the ${standings.MRData.StandingsTable.season} season.`;
			}

			for (const standing of standingsList.DriverStandings.slice(0, 10)) {
				output += ` ${standing.position}. ${standing.Driver.code} - \x0303[${standing.points}]\x03`;
			}

			return output;
		},
	);
}

function findResultByCode<T extends { Driver: { code?: string } }>(
	results: T[] | undefined,
	code: string,
): T | undefined {
	return results?.find((result) => result.Driver.code?.toUpperCase() === code);
}

function parsePosition(position: string | undefined): number | null {
	if (!position) return null;
	const parsed = Number.parseInt(position, 10);
	return Number.isNaN(parsed) ? null : parsed;
}

export async function fetchHeadToHead(leftCodeArg: string, rightCodeArg: string): Promise<string> {
	const leftCode = leftCodeArg.toUpperCase();
	const rightCode = rightCodeArg.toUpperCase();

	const [standingsResponse, raceResultsResponse, qualifyingResultsResponse] = await Promise.all([
		fetchJson<CurrentDriverStandings>(
			`${ERGAST_API_ENDPOINT}/current/driverstandings/?format=json`,
		),
		fetchJson<RaceTableResponse<{ Results: SessionResultEntry[] }>>(
			`${ERGAST_API_ENDPOINT}/current/results/?format=json&limit=1000`,
		),
		fetchJson<RaceTableResponse<{ QualifyingResults: SessionResultEntry[] }>>(
			`${ERGAST_API_ENDPOINT}/current/qualifying/?format=json&limit=1000`,
		),
	]);

	const standingsTable = standingsResponse.MRData.StandingsTable;
	const season = standingsTable.season;
	const driverStandings = standingsTable.StandingsLists[0]?.DriverStandings ?? [];
	const races = raceResultsResponse.MRData.RaceTable.Races;
	const qualifyingSessions = qualifyingResultsResponse.MRData.RaceTable.Races;
	if (driverStandings.length === 0 && races.length === 0 && qualifyingSessions.length === 0) {
		return `No H2H data yet for the ${season} season.`;
	}

	const standingsByCode = new Map(
		driverStandings.map((standing) => [standing.Driver.code?.toUpperCase(), standing] as const),
	);
	const leftStanding = standingsByCode.get(leftCode);
	if (!leftStanding) {
		return `Unknown driver code: ${leftCode}.`;
	}

	const rightStanding = standingsByCode.get(rightCode);
	if (!rightStanding) {
		return `Unknown driver code: ${rightCode}.`;
	}

	const drivers: Array<{
		standing: (typeof driverStandings)[number];
		raceWins: number;
		qualiWins: number;
		podiums: number;
		bestFinish: number | null;
	}> = [
		{ standing: leftStanding, raceWins: 0, qualiWins: 0, podiums: 0, bestFinish: null },
		{ standing: rightStanding, raceWins: 0, qualiWins: 0, podiums: 0, bestFinish: null },
	];

	for (const race of races) {
		const positions: [number | null, number | null] = [
			parsePosition(findResultByCode(race.Results, leftCode)?.position),
			parsePosition(findResultByCode(race.Results, rightCode)?.position),
		];

		for (const [index, position] of positions.entries()) {
			if (position === null) continue;
			const driver = drivers[index];
			if (position <= 3) driver.podiums++;
			if (driver.bestFinish === null || position < driver.bestFinish) {
				driver.bestFinish = position;
			}
		}

		if (positions[0] !== null && positions[1] !== null) {
			if (positions[0] < positions[1]) drivers[0].raceWins++;
			if (positions[1] < positions[0]) drivers[1].raceWins++;
		}
	}

	for (const session of qualifyingSessions) {
		const positions: [number | null, number | null] = [
			parsePosition(findResultByCode(session.QualifyingResults, leftCode)?.position),
			parsePosition(findResultByCode(session.QualifyingResults, rightCode)?.position),
		];

		if (positions[0] !== null && positions[1] !== null) {
			if (positions[0] < positions[1]) drivers[0].qualiWins++;
			if (positions[1] < positions[0]) drivers[1].qualiWins++;
		}
	}

	return `⚔️ \x02H2H ${leftCode} vs ${rightCode}\x02 (${season}): Race \x0303${drivers[0].raceWins}-${drivers[1].raceWins}\x03 | Quali \x0303${drivers[0].qualiWins}-${drivers[1].qualiWins}\x03 | Points \x0303${drivers[0].standing.points}-${drivers[1].standing.points}\x03 | Podiums \x0303${drivers[0].podiums}-${drivers[1].podiums}\x03 | Best finish \x0303${drivers[0].bestFinish ? `P${drivers[0].bestFinish}` : "-"}/${drivers[1].bestFinish ? `P${drivers[1].bestFinish}` : "-"}\x03`;
}

export async function fetchNextEvent(): Promise<string | null> {
	console.log("Checking for upcoming events...");

	const nextEvent = await getNextEvent();
	if (!nextEvent) {
		console.log("No upcoming events found in database");
		return null;
	}

	const { meetingName, eventType, startTime } = nextEvent;
	const eventTime = startTime * 1000;
	const timeToEventMinutes = Math.floor((eventTime - Date.now()) / (1000 * 60));

	console.log(
		`Found upcoming event: ${meetingName}, type: ${eventType}, time: ${new Date(eventTime).toISOString()}`,
	);
	console.log(`Time to event: ${timeToEventMinutes} minutes`);

	if (timeToEventMinutes <= 0 || timeToEventMinutes > 5) {
		console.log(
			`Event not starting soon (${timeToEventMinutes} minutes away), no notification needed`,
		);
		return null;
	}

	const eventTypeName = await getEventTypeName(eventType);
	console.log(`Event starting soon! Preparing notification for ${meetingName}: ${eventTypeName}`);
	return `🏎️ \x02${meetingName}: ${eventTypeName}\x02 begins in 5 minutes.`;
}

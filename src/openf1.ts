import type { Driver, DriverStanding, SessionResults } from "~/types/models";

const F1_BLOCK_MS = 60 * 60 * 1000;
const F1_SESSION_PATH_PREFIX = "openf1";
const OPENF1_ENDPOINT = "https://api.openf1.org/v1";
const OPENF1_REQUEST_INTERVAL_MS = 250;
const SESSION_NAME_ALIASES: Record<string, string> = {
	practice1: "Practice 1",
	practice2: "Practice 2",
	practice3: "Practice 3",
	fp1: "Practice 1",
	fp2: "Practice 2",
	fp3: "Practice 3",
	qualifying: "Qualifying",
	race: "Race",
	sprint: "Sprint",
	sprintqualifying: "Sprint Qualifying",
	sprintshootout: "Sprint Qualifying",
};

let f1BlockedUntil = 0;
let nextOpenF1RequestTime = 0;
let openF1RequestQueue = Promise.resolve();
let openF1RequestIntervalMs = OPENF1_REQUEST_INTERVAL_MS;

export class LiveTimingAccessDeniedError extends Error {
	constructor(url: string) {
		super(`F1 live timing returned 403 for URL: ${url}`);
		this.name = "LiveTimingAccessDeniedError";
	}
}

export interface OpenF1Session {
	date_end: string;
	date_start: string;
	location: string;
	meeting_key: number;
	session_key: number;
	session_name: string;
	year: number;
}

export interface OpenF1RaceControlMessage {
	category: string;
	date: string;
	flag: string | null;
	message: string;
}

export interface OpenF1Weather {
	air_temperature: number;
	humidity: number;
	rainfall: number;
	track_temperature: number;
	wind_direction: number;
	wind_speed: number;
}

export interface OpenF1Stint {
	compound: string;
	driver_number: number;
	lap_end: number | null;
	lap_start: number;
	stint_number: number;
	tyre_age_at_start: number;
}

interface OpenF1Driver {
	broadcast_name: string;
	driver_number: number;
	first_name: string;
	full_name: string;
	last_name: string;
	name_acronym: string;
	team_colour: string;
	team_name: string;
}

interface OpenF1Position {
	date: string;
	driver_number: number;
	position: number;
}

interface OpenF1SessionResult {
	dnf: boolean;
	dns: boolean;
	dsq: boolean;
	driver_number: number;
	duration: number | Array<number | null> | null;
	gap_to_leader: number | string | Array<number | string | null> | null;
	position: number;
}

function cleanJson(text: string): unknown {
	return JSON.parse(text.trim().replace(/^\uFEFF/, ""));
}

export function isLiveTimingAccessDenied(error: unknown): boolean {
	return error instanceof LiveTimingAccessDeniedError;
}

function rememberF1Block(url: string): void {
	const now = Date.now();
	if (now >= f1BlockedUntil) {
		console.warn("F1 live timing returned 403; using OpenF1 for one hour");
	}
	f1BlockedUntil = now + F1_BLOCK_MS;
	throw new LiveTimingAccessDeniedError(url);
}

export function resetOpenF1StateForTests(): void {
	f1BlockedUntil = 0;
	nextOpenF1RequestTime = 0;
	openF1RequestQueue = Promise.resolve();
	openF1RequestIntervalMs = OPENF1_REQUEST_INTERVAL_MS;
}

export function setOpenF1RequestIntervalForTests(intervalMs: number): void {
	openF1RequestIntervalMs = intervalMs;
}

export async function fetchLiveTimingJson<T>(url: string): Promise<T> {
	if (Date.now() < f1BlockedUntil) {
		throw new LiveTimingAccessDeniedError(url);
	}

	const response = await fetch(url, {
		signal: AbortSignal.timeout(10000),
	});

	if (response.status === 403) {
		rememberF1Block(url);
	}

	if (!response.ok) {
		throw new Error(`HTTP error! Status: ${response.status} for URL: ${url}`);
	}

	return cleanJson(await response.text()) as T;
}

export async function fetchOptionalLiveTimingJson<T>(url: string): Promise<T | undefined> {
	if (Date.now() < f1BlockedUntil) {
		throw new LiveTimingAccessDeniedError(url);
	}

	const response = await fetch(url, {
		signal: AbortSignal.timeout(10000),
	});

	if (response.status === 403) {
		rememberF1Block(url);
	}

	if (response.status === 404) {
		return undefined;
	}

	if (!response.ok) {
		throw new Error(`HTTP error! Status: ${response.status} for URL: ${url}`);
	}

	return cleanJson(await response.text()) as T;
}

async function throttleOpenF1Request(): Promise<void> {
	let releaseQueue!: () => void;
	const previousRequest = openF1RequestQueue;
	openF1RequestQueue = new Promise((resolve) => {
		releaseQueue = resolve;
	});

	await previousRequest;
	const waitMs = nextOpenF1RequestTime - Date.now();
	if (waitMs > 0) {
		await Bun.sleep(waitMs);
	}
	nextOpenF1RequestTime = Date.now() + openF1RequestIntervalMs;
	releaseQueue();
}

async function fetchOpenF1Json<T>(path: string, params: Record<string, string>): Promise<T> {
	await throttleOpenF1Request();
	const url = new URL(`${OPENF1_ENDPOINT}/${path}`);
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.append(key, value);
	}

	const response = await fetch(url, {
		signal: AbortSignal.timeout(10000),
	});

	if (!response.ok) {
		throw new Error(`OpenF1 HTTP error! Status: ${response.status} for URL: ${url}`);
	}

	return cleanJson(await response.text()) as T;
}

function normalizeSessionName(sessionName: string): string {
	return sessionName.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function officialSessionName(rawName: string): string | null {
	return SESSION_NAME_ALIASES[normalizeSessionName(rawName)] ?? null;
}

function parseOfficialSessionPath(path: string): { date: string; sessionName: string } | null {
	const sessionSegment = path.replace(/\/+$/, "").split("/").at(-1);
	if (!sessionSegment) return null;

	const match = /^(\d{4}-\d{2}-\d{2})_(.+)$/.exec(sessionSegment);
	if (!match) return null;

	const sessionName = officialSessionName(match[2].replace(/_/g, " "));
	if (!sessionName) return null;

	return { date: match[1], sessionName };
}

export function openF1SessionPath(sessionKey: number): string {
	return `${F1_SESSION_PATH_PREFIX}/${sessionKey}/`;
}

export function openF1SessionKeyFromPath(path: string): number | null {
	const match = new RegExp(`^${F1_SESSION_PATH_PREFIX}/(\\d+)/?$`).exec(path);
	return match ? Number.parseInt(match[1], 10) : null;
}

export function openF1SessionTitle(session: OpenF1Session): string {
	return `${session.location} Grand Prix: ${session.session_name}`;
}

export async function fetchOpenF1CurrentSession(): Promise<OpenF1Session> {
	const sessions = await fetchOpenF1Json<OpenF1Session[]>("sessions", { session_key: "latest" });
	const session = sessions[0];
	if (!session) {
		throw new Error("OpenF1 returned no latest session");
	}

	return session;
}

export async function resolveOpenF1Session(path: string): Promise<OpenF1Session> {
	const sessionKey = openF1SessionKeyFromPath(path);
	if (sessionKey !== null) {
		const sessions = await fetchOpenF1Json<OpenF1Session[]>("sessions", {
			session_key: String(sessionKey),
		});
		const session = sessions[0];
		if (!session) {
			throw new Error(`OpenF1 session not found for ${path}`);
		}

		return session;
	}

	const parsed = parseOfficialSessionPath(path);
	if (!parsed) {
		return fetchOpenF1CurrentSession();
	}

	const nextDate = new Date(`${parsed.date}T00:00:00Z`);
	nextDate.setUTCDate(nextDate.getUTCDate() + 1);
	const sessions = await fetchOpenF1Json<OpenF1Session[]>("sessions", {
		"date_start>=": parsed.date,
		"date_start<": nextDate.toISOString().slice(0, 10),
	});
	const session = sessions.find(
		(candidate) =>
			normalizeSessionName(candidate.session_name) === normalizeSessionName(parsed.sessionName),
	);
	if (!session) {
		throw new Error(`OpenF1 session not found for ${path}`);
	}

	return session;
}

export async function readOpenF1CurrentEvent(): Promise<{ path: string; isComplete: boolean }> {
	const session = await fetchOpenF1CurrentSession();
	return {
		path: openF1SessionPath(session.session_key),
		isComplete: Date.parse(session.date_end) <= Date.now(),
	};
}

export async function fetchOpenF1Drivers(path: string): Promise<Driver[]> {
	const session = await resolveOpenF1Session(path);
	const drivers = await fetchOpenF1Json<OpenF1Driver[]>("drivers", {
		session_key: String(session.session_key),
	});

	return openF1Drivers(drivers);
}

function openF1Drivers(drivers: OpenF1Driver[]): Driver[] {
	return drivers
		.toSorted((left, right) => left.driver_number - right.driver_number)
		.map((driver) => ({
			racingNumber: driver.driver_number,
			reference: "",
			firstName: driver.first_name,
			lastName: driver.last_name,
			fullName: driver.full_name,
			broadcastName: driver.broadcast_name,
			tla: driver.name_acronym,
			teamName: driver.team_name,
			teamColor: driver.team_colour,
		}));
}

export async function fetchOpenF1RaceControlMessages(
	path = "",
): Promise<{ session: OpenF1Session; messages: OpenF1RaceControlMessage[] }> {
	const session = path ? await resolveOpenF1Session(path) : await fetchOpenF1CurrentSession();
	const messages = await fetchOpenF1Json<OpenF1RaceControlMessage[]>("race_control", {
		session_key: String(session.session_key),
	});

	return { session, messages };
}

export async function fetchOpenF1Weather(path = ""): Promise<{
	session: OpenF1Session;
	weather: OpenF1Weather;
}> {
	const session = path ? await resolveOpenF1Session(path) : await fetchOpenF1CurrentSession();
	const weatherRows = await fetchOpenF1Json<OpenF1Weather[]>("weather", {
		session_key: String(session.session_key),
	});
	const weather = weatherRows.at(-1);
	if (!weather) {
		throw new Error(`OpenF1 weather not found for ${openF1SessionPath(session.session_key)}`);
	}

	return { session, weather };
}

export async function fetchOpenF1Stints(path = ""): Promise<{
	drivers: Driver[];
	positions: OpenF1Position[];
	session: OpenF1Session;
	stints: OpenF1Stint[];
}> {
	const session = path ? await resolveOpenF1Session(path) : await fetchOpenF1CurrentSession();
	const [driverRows, stints, positions] = await Promise.all([
		fetchOpenF1Json<OpenF1Driver[]>("drivers", { session_key: String(session.session_key) }),
		fetchOpenF1Json<OpenF1Stint[]>("stints", { session_key: String(session.session_key) }),
		fetchOpenF1Json<OpenF1Position[]>("position", { session_key: String(session.session_key) }),
	]);

	return { drivers: openF1Drivers(driverRows), positions, session, stints };
}

function scalarResultValue<T>(value: T | Array<T | null> | null): T | null {
	if (!Array.isArray(value)) return value;
	for (const item of value.toReversed()) {
		if (item !== null) return item;
	}
	return null;
}

function formatSeconds(seconds: number): string {
	const wholeSeconds = Math.floor(seconds);
	const millis = Math.round((seconds - wholeSeconds) * 1000);
	const minutes = Math.floor(wholeSeconds / 60);
	const remainingSeconds = wholeSeconds % 60;
	return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}

function formatOpenF1ResultTime(result: OpenF1SessionResult): string {
	if (result.dsq) return "DSQ";
	if (result.dns) return "DNS";
	if (result.dnf) return "DNF";

	const gap = scalarResultValue(result.gap_to_leader);
	if (result.position !== 1 && gap !== null) {
		return typeof gap === "number" ? `+${gap.toFixed(3)}` : gap;
	}

	const duration = scalarResultValue(result.duration);
	return typeof duration === "number" ? formatSeconds(duration) : "";
}

export async function fetchOpenF1SessionResultData(
	path: string,
): Promise<{ session: OpenF1Session; results: SessionResults }> {
	const session = await resolveOpenF1Session(path);
	const [driverRows, results] = await Promise.all([
		fetchOpenF1Json<OpenF1Driver[]>("drivers", { session_key: String(session.session_key) }),
		fetchOpenF1Json<OpenF1SessionResult[]>("session_result", {
			session_key: String(session.session_key),
		}),
	]);

	const drivers = openF1Drivers(driverRows);
	const driversByNumber = new Map(drivers.map((driver) => [driver.racingNumber, driver]));
	const standings: DriverStanding[] = results
		.toSorted((left, right) => left.position - right.position)
		.flatMap((result) => {
			const driver = driversByNumber.get(result.driver_number);
			if (!driver) return [];

			return [
				{
					position: result.position,
					driverName: driver.tla,
					teamName: driver.teamName,
					time: formatOpenF1ResultTime(result),
				},
			];
		});

	return {
		session,
		results: {
			title: openF1SessionTitle(session),
			standings,
		},
	};
}

export async function fetchOpenF1SessionResults(path: string): Promise<SessionResults> {
	return (await fetchOpenF1SessionResultData(path)).results;
}

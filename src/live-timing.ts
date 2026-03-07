import * as signalR from "@microsoft/signalr";

const F1_SESSION_ENDPOINT = "https://livetiming.formula1.com/static";
const F1_SIGNALR_ENDPOINT = "https://livetiming.formula1.com/signalrcore";

interface CurrentSessionInfo {
	Meeting: {
		Name: string;
	};
	Name: string;
	Path: string;
}

export interface RaceControlMessage {
	Utc: string;
	Category: string;
	Message: string;
	Flag?: string;
	Status?: string;
	Mode?: string;
}

interface RaceControlMessagesResponse {
	Messages: RaceControlMessage[];
}

interface LiveTimingSnapshot {
	RaceControlMessages?: RaceControlMessagesResponse;
	SessionInfo?: CurrentSessionInfo;
}

interface LiveTimingConnection {
	start(): Promise<void>;
	stop(): Promise<void>;
	invoke<T>(methodName: string, ...args: unknown[]): Promise<T>;
}

interface WeatherData {
	AirTemp: string;
	Humidity: string;
	Rainfall: string;
	TrackTemp: string;
	WindDirection: string;
	WindSpeed: string;
}

interface SessionDriver {
	RacingNumber: string;
	Tla: string;
}

interface PitStopRecord {
	RacingNumber: string;
	PitStopTime: string;
	Lap: string;
}

interface PitStopSeriesResponse {
	PitTimes: Record<
		string,
		Array<{
			PitStop: PitStopRecord;
		}>
	>;
}

interface TimingStint {
	Compound: string;
	New: boolean | string;
	TotalLaps: number | string;
}

interface TimingAppLine {
	RacingNumber: string;
	Line: number;
	Stints: TimingStint[];
}

interface TimingAppDataResponse {
	Lines: Record<string, TimingAppLine>;
}

async function fetchJson<T>(url: string): Promise<T> {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(10000),
	});

	if (!response.ok) {
		throw new Error(`HTTP error! Status: ${response.status} for URL: ${url}`);
	}

	const text = (await response.text()).trim().replace(/^\uFEFF/, "");
	return JSON.parse(text) as T;
}

async function fetchCurrentSessionInfo(): Promise<CurrentSessionInfo> {
	return fetchJson<CurrentSessionInfo>(`${F1_SESSION_ENDPOINT}/SessionInfo.json`);
}

export function createLiveTimingConnection(): LiveTimingConnection {
	return (
		new signalR.HubConnectionBuilder()
			// AIDEV-NOTE: current-session static JSON is archive-only; live race control has to come from SignalR.
			.withUrl(F1_SIGNALR_ENDPOINT, {
				transport: signalR.HttpTransportType.WebSockets,
				withCredentials: true,
				timeout: 10000,
			})
			.build()
	);
}

function formatSessionTitle(session: CurrentSessionInfo): string {
	return `${session.Meeting.Name}: ${session.Name}`;
}

export function buildRaceControlMessageKey(message: RaceControlMessage): string {
	return [
		message.Utc,
		message.Category,
		message.Flag || "",
		message.Status || "",
		message.Mode || "",
		message.Message,
	].join("|");
}

export function shouldAutopostRaceControlMessage(message: RaceControlMessage): boolean {
	if (message.Category === "Flag" && message.Flag === "RED") {
		return true;
	}

	if (message.Category === "SafetyCar" && message.Status === "DEPLOYED" && message.Mode !== "VSC") {
		return true;
	}

	const normalizedMessage = message.Message.toUpperCase();
	return (
		normalizedMessage.includes("PENALTY") &&
		!normalizedMessage.includes("NO PENALTY") &&
		!normalizedMessage.includes("PENALTY SERVED")
	);
}

export function formatAutopostRaceControlMessage(
	session: CurrentSessionInfo,
	message: RaceControlMessage,
): string {
	const title = formatSessionTitle(session);

	if (message.Category === "Flag" && message.Flag === "RED") {
		return `🚩 \x02${title}\x02: RED FLAG`;
	}

	if (message.Category === "SafetyCar" && message.Status === "DEPLOYED" && message.Mode !== "VSC") {
		return `🚨 \x02${title}\x02: SAFETY CAR DEPLOYED`;
	}

	return `⚖️ \x02${title}\x02: ${message.Message}`;
}

export async function fetchCurrentSessionRaceControlMessages(
	createConnection: () => LiveTimingConnection = createLiveTimingConnection,
): Promise<{
	session: CurrentSessionInfo;
	messages: RaceControlMessage[];
}> {
	const connection = createConnection();

	try {
		await connection.start();
		const snapshot = await connection.invoke<LiveTimingSnapshot>("Subscribe", [
			"RaceControlMessages",
			"SessionInfo",
		]);

		if (!snapshot.SessionInfo || !snapshot.RaceControlMessages) {
			throw new Error("Live timing snapshot missing SessionInfo or RaceControlMessages");
		}

		return {
			session: snapshot.SessionInfo,
			messages: snapshot.RaceControlMessages.Messages || [],
		};
	} finally {
		await connection.stop();
	}
}

export async function fetchSessionWeather(): Promise<string> {
	const session = await fetchCurrentSessionInfo();
	const weather = await fetchJson<WeatherData>(
		`${F1_SESSION_ENDPOINT}/${session.Path}WeatherData.json`,
	);

	return `🌦️ \x02${formatSessionTitle(session)} Weather\x02: Air ${weather.AirTemp}C | Track ${weather.TrackTemp}C | Humidity ${weather.Humidity}% | Wind ${weather.WindSpeed} @ ${weather.WindDirection}deg | Rain ${weather.Rainfall}`;
}

export async function fetchSessionPitStops(): Promise<string> {
	const session = await fetchCurrentSessionInfo();
	const title = formatSessionTitle(session);

	try {
		const [pitStops, driverList] = await Promise.all([
			fetchJson<PitStopSeriesResponse>(`${F1_SESSION_ENDPOINT}/${session.Path}PitStopSeries.json`),
			fetchJson<Record<string, SessionDriver>>(
				`${F1_SESSION_ENDPOINT}/${session.Path}DriverList.json`,
			),
		]);

		const driverMap = new Map(
			Object.values(driverList).map((driver) => [driver.RacingNumber, driver.Tla]),
		);

		const stops = Object.values(pitStops.PitTimes)
			.flat()
			.map((entry) => entry.PitStop)
			.filter((stop) => !Number.isNaN(Number.parseFloat(stop.PitStopTime)))
			.sort(
				(left, right) => Number.parseFloat(left.PitStopTime) - Number.parseFloat(right.PitStopTime),
			)
			.slice(0, 5);

		if (stops.length === 0) {
			return `No pit stops recorded for ${title}.`;
		}

		const summary = stops
			.map((stop) => {
				const driver = driverMap.get(stop.RacingNumber) || stop.RacingNumber;
				return `${driver} ${stop.PitStopTime}s (L${stop.Lap})`;
			})
			.join(" | ");

		return `🔧 \x02${title} Pit Stops\x02: ${summary}`;
	} catch (error) {
		if (error instanceof Error && error.message.includes("Status: 403")) {
			return `Pit stop data not available for ${title}.`;
		}

		throw error;
	}
}

export async function fetchSessionStints(): Promise<string> {
	const session = await fetchCurrentSessionInfo();
	const title = formatSessionTitle(session);
	const [timingAppData, driverList] = await Promise.all([
		fetchJson<TimingAppDataResponse>(`${F1_SESSION_ENDPOINT}/${session.Path}TimingAppData.json`),
		fetchJson<Record<string, SessionDriver>>(
			`${F1_SESSION_ENDPOINT}/${session.Path}DriverList.json`,
		),
	]);

	const driverMap = new Map(
		Object.values(driverList).map((driver) => [driver.RacingNumber, driver.Tla]),
	);

	const stints = Object.values(timingAppData.Lines)
		.map((line) => {
			const currentStint = line.Stints.at(-1);
			if (!currentStint) return null;

			const laps =
				typeof currentStint.TotalLaps === "number"
					? currentStint.TotalLaps
					: Number.parseInt(currentStint.TotalLaps, 10);
			if (Number.isNaN(laps)) return null;

			const isNew = currentStint.New === true || currentStint.New === "true";
			const tyreAge = isNew ? `${laps},new` : `${laps}`;

			return {
				line: line.Line,
				driver: driverMap.get(line.RacingNumber) || line.RacingNumber,
				stint: `${currentStint.Compound.toLowerCase()}(${tyreAge})`,
			};
		})
		.filter((line): line is { line: number; driver: string; stint: string } => line !== null)
		.sort((left, right) => left.line - right.line)
		.slice(0, 8);

	if (stints.length === 0) {
		return `No stint data available for ${title}.`;
	}

	return `🛞 \x02${title} Stints\x02: ${stints.map((stint) => `${stint.driver} ${stint.stint}`).join(" | ")}`;
}

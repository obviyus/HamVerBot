import * as signalR from "@microsoft/signalr";
import config from "./config";

const F1_SIGNALR_ENDPOINT = config.liveTiming.signalrBaseUrl;
const AUTOPOST_RACE_CONTROL_WINDOW_MS = 5 * 60 * 1000;

interface CurrentSessionInfo {
	Meeting: {
		Name: string;
		OfficialName: string;
	};
	ArchiveStatus: {
		Status: string;
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

interface LiveTimingConnection {
	start(): Promise<void>;
	stop(): Promise<void>;
	invoke<T>(methodName: string, ...args: unknown[]): Promise<T>;
}

class BunSignalRHttpClient extends signalR.HttpClient {
	private readonly cookies = new Map<string, string>();

	private rememberCookies(response: Response): void {
		const rawCookies = response.headers.get("set-cookie");
		if (!rawCookies) return;

		for (const match of rawCookies.matchAll(/(?:AWSALB|AWSALBCORS)=[^;]+/g)) {
			const cookie = match[0];
			const [name] = cookie.split("=", 1);
			if (!name) continue;
			this.cookies.set(name, cookie);
		}
	}

	async send(request: signalR.HttpRequest): Promise<signalR.HttpResponse> {
		if (!request.method) {
			throw new Error("No method defined.");
		}

		if (!request.url) {
			throw new Error("No url defined.");
		}

		const abortController = new AbortController();
		if (request.abortSignal?.aborted) {
			abortController.abort();
		} else if (request.abortSignal) {
			request.abortSignal.onabort = () => {
				abortController.abort();
			};
		}

		const signal =
			request.timeout && typeof AbortSignal.any === "function"
				? AbortSignal.any([abortController.signal, AbortSignal.timeout(request.timeout)])
				: request.timeout
					? AbortSignal.timeout(request.timeout)
					: abortController.signal;

		const cookieHeader = [...this.cookies.values()].join("; ");
		const response = await fetch(request.url, {
			method: request.method,
			body: request.content as BodyInit | null | undefined,
			cache: "no-cache",
			credentials: request.withCredentials === true ? "include" : "same-origin",
			headers: {
				...(cookieHeader ? { Cookie: cookieHeader } : {}),
				"X-Requested-With": "XMLHttpRequest",
				...request.headers,
			},
			mode: "cors",
			redirect: "follow",
			signal,
		});
		this.rememberCookies(response);

		const content =
			request.responseType === "arraybuffer" ? await response.arrayBuffer() : await response.text();

		if (!response.ok) {
			const errorMessage =
				typeof content === "string"
					? content || response.statusText
					: response.statusText || "SignalR HTTP request failed";
			throw new signalR.HttpError(errorMessage, response.status);
		}

		return new signalR.HttpResponse(response.status, response.statusText, content);
	}
}

export interface LiveTimingDriver {
	RacingNumber: string;
	Reference?: string;
	FirstName?: string;
	LastName?: string;
	FullName?: string;
	BroadcastName?: string;
	Tla: string;
	TeamName?: string;
	TeamColour?: string;
}

export interface LiveTimingLine {
	Position?: string;
	RacingNumber?: string;
	BestLapTime?: {
		Value?: string;
	};
	Stats?: Array<{
		TimeDifftoPositionAhead?: string;
	}>;
}

interface LiveTimingSnapshot {
	RaceControlMessages?: {
		Messages: RaceControlMessage[];
	};
	SessionInfo?: CurrentSessionInfo;
	WeatherData?: {
		AirTemp: string;
		Humidity: string;
		Rainfall: string;
		TrackTemp: string;
		WindDirection: string;
		WindSpeed: string;
	};
	DriverList?: Record<string, LiveTimingDriver>;
	TimingDataF1?: {
		Lines: Record<string, LiveTimingLine>;
	};
	TimingAppData?: {
		Lines: Record<
			string,
			{
				RacingNumber: string;
				Line: number;
				Stints: Array<{
					Compound: string;
					New: boolean | string;
					TotalLaps: number | string;
				}>;
			}
		>;
	};
}

type LiveTimingTopic = Exclude<keyof LiveTimingSnapshot, "SessionInfo">;

export function createLiveTimingConnection(): LiveTimingConnection {
	return new signalR.HubConnectionBuilder()
		.withUrl(F1_SIGNALR_ENDPOINT, {
			httpClient: new BunSignalRHttpClient(),
			transport: signalR.HttpTransportType.WebSockets,
			skipNegotiation: true,
			withCredentials: true,
			timeout: 10000,
		})
		.configureLogging(signalR.LogLevel.Error)
		.build();
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

function raceControlTimestamp(utc: string): number {
	return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(utc) ? utc : `${utc}Z`);
}

export function isRecentRaceControlMessage(message: RaceControlMessage, now = Date.now()): boolean {
	const timestamp = raceControlTimestamp(message.Utc);
	return Number.isFinite(timestamp) && timestamp >= now - AUTOPOST_RACE_CONTROL_WINDOW_MS;
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

export async function fetchCurrentSessionSnapshot(
	topics: LiveTimingTopic[],
	createConnection: () => LiveTimingConnection = createLiveTimingConnection,
): Promise<LiveTimingSnapshot> {
	const connection = createConnection();
	try {
		await connection.start();
		const snapshot = await connection.invoke<LiveTimingSnapshot>("Subscribe", [
			"SessionInfo",
			...topics,
		]);
		// SignalR marks each topic as a keyframe; static JSON never had this key.
		for (const topic of Object.values(snapshot)) {
			delete (topic as { _kf?: boolean })._kf;
		}
		return snapshot;
	} finally {
		await connection.stop();
	}
}

export async function fetchCurrentSessionRaceControlMessages(
	createConnection: () => LiveTimingConnection = createLiveTimingConnection,
): Promise<{
	session: CurrentSessionInfo;
	messages: RaceControlMessage[];
}> {
	const snapshot = await fetchCurrentSessionSnapshot(["RaceControlMessages"], createConnection);
	if (!snapshot.SessionInfo || !snapshot.RaceControlMessages) {
		throw new Error("Live timing snapshot missing SessionInfo or RaceControlMessages");
	}

	return {
		session: snapshot.SessionInfo,
		messages: snapshot.RaceControlMessages.Messages || [],
	};
}

export async function fetchSessionWeather(
	createConnection: () => LiveTimingConnection = createLiveTimingConnection,
): Promise<string> {
	const snapshot = await fetchCurrentSessionSnapshot(["WeatherData"], createConnection);
	if (!snapshot.SessionInfo || !snapshot.WeatherData) {
		throw new Error("Live timing snapshot missing SessionInfo or WeatherData");
	}

	const session = snapshot.SessionInfo;
	const weather = snapshot.WeatherData;

	return `🌦️ \x02${formatSessionTitle(session)} Weather\x02: Air ${weather.AirTemp}C | Track ${weather.TrackTemp}C | Humidity ${weather.Humidity}% | Wind ${weather.WindSpeed} @ ${weather.WindDirection}deg | Rain ${weather.Rainfall}`;
}

export async function fetchSessionStints(
	createConnection: () => LiveTimingConnection = createLiveTimingConnection,
): Promise<string> {
	const snapshot = await fetchCurrentSessionSnapshot(
		["DriverList", "TimingAppData"],
		createConnection,
	);
	if (!snapshot.SessionInfo || !snapshot.DriverList || !snapshot.TimingAppData) {
		throw new Error("Live timing snapshot missing SessionInfo, DriverList, or TimingAppData");
	}

	const session = snapshot.SessionInfo;
	const title = formatSessionTitle(session);

	const driverMap = new Map(
		Object.values(snapshot.DriverList).map((driver) => [driver.RacingNumber, driver.Tla]),
	);

	const stints = Object.values(snapshot.TimingAppData.Lines)
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

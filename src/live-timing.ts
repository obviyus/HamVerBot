import * as signalR from "@microsoft/signalr";

const F1_STATIC_ENDPOINT = "https://livetiming.formula1.com/static";
const F1_SIGNALR_ENDPOINT = "https://livetiming.formula1.com/signalrcore";

interface CurrentSessionInfo {
	Meeting: {
		Name: string;
	};
	ArchiveStatus: {
		Status: string;
	};
	Name: string;
	Path: string;
	SessionStatus?: string;
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

interface LiveTimingConnection {
	start(): Promise<void>;
	stop(): Promise<void>;
	invoke<T>(methodName: string, ...args: unknown[]): Promise<T>;
}

class BunSignalRHttpClient extends signalR.HttpClient {
	private readonly cookies = new Map<string, string>();

	getCookieString(): string {
		return [...this.cookies.values()].join("; ");
	}

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

		const cookieHeader = this.getCookieString();
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

interface LiveTimingSnapshot {
	RaceControlMessages?: RaceControlMessagesResponse;
	SessionInfo?: CurrentSessionInfo;
	WeatherData?: WeatherData;
	DriverList?: Record<string, SessionDriver>;
	TimingAppData?: TimingAppDataResponse;
}

type LiveTimingTopic = Exclude<keyof LiveTimingSnapshot, "SessionInfo">;

export function createLiveTimingConnection(): LiveTimingConnection {
	return (
		new signalR.HubConnectionBuilder()
			// AIDEV-NOTE: live topics come from SignalR while archive generation is in flight; completed sessions fall back to static JSON.
			.withUrl(F1_SIGNALR_ENDPOINT, {
				httpClient: new BunSignalRHttpClient(),
				transport: signalR.HttpTransportType.WebSockets,
				withCredentials: true,
				timeout: 10000,
			})
			.configureLogging(signalR.LogLevel.Error)
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

async function fetchOptionalJson<T>(url: string): Promise<T | undefined> {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(10000),
	});

	if (response.status === 403) {
		return undefined;
	}

	if (!response.ok) {
		throw new Error(`HTTP error! Status: ${response.status} for URL: ${url}`);
	}

	const text = (await response.text()).trim().replace(/^\uFEFF/, "");
	return JSON.parse(text) as T;
}

async function fetchJson<T>(url: string): Promise<T> {
	const data = await fetchOptionalJson<T>(url);
	if (data === undefined) {
		throw new Error(`HTTP error! Status: 403 for URL: ${url}`);
	}

	return data;
}

async function fetchCurrentSessionInfo(): Promise<CurrentSessionInfo> {
	return fetchJson<CurrentSessionInfo>(`${F1_STATIC_ENDPOINT}/SessionInfo.json`);
}

async function fetchSignalRSnapshot(
	topics: Array<keyof LiveTimingSnapshot>,
	createConnection: () => LiveTimingConnection = createLiveTimingConnection,
): Promise<LiveTimingSnapshot> {
	const connection = createConnection();

	try {
		await connection.start();
		return await connection.invoke<LiveTimingSnapshot>("Subscribe", topics);
	} finally {
		await connection.stop();
	}
}

async function fetchStaticSnapshot(
	session: CurrentSessionInfo,
	topics: LiveTimingTopic[],
): Promise<LiveTimingSnapshot> {
	const entries = await Promise.all(
		topics.map(async (topic) => {
			const data = await fetchOptionalJson(`${F1_STATIC_ENDPOINT}/${session.Path}${topic}.json`);
			return [topic, data] as const;
		}),
	);

	return Object.fromEntries([
		["SessionInfo", session],
		...entries.filter((entry): entry is [LiveTimingTopic, unknown] => entry[1] !== undefined),
	]) as LiveTimingSnapshot;
}

async function fetchCurrentSessionSnapshot(
	topics: LiveTimingTopic[],
	createConnection: () => LiveTimingConnection = createLiveTimingConnection,
): Promise<LiveTimingSnapshot> {
	const session = await fetchCurrentSessionInfo();
	if (session.ArchiveStatus.Status === "Complete") {
		return await fetchStaticSnapshot(session, topics);
	}

	return await fetchSignalRSnapshot(["SessionInfo", ...topics], createConnection);
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

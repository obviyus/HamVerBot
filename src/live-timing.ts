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
	Type?: string;
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

interface PitStopRecord {
	RacingNumber: string;
	PitStopTime: string;
	Lap: string;
}

interface PitStopSeriesResponse {
	PitTimes: Record<
		string,
		| Array<{
				PitStop: PitStopRecord;
		  }>
		| Record<
				string,
				{
					PitStop: PitStopRecord;
				}
		  >
	>;
}

interface TimingStint {
	Compound: string;
	New: boolean | string;
	TotalLaps: number | string;
	StartLaps?: number | string;
	TyresNotChanged?: boolean | string;
}

interface TimingAppLine {
	RacingNumber: string;
	Line: number;
	Stints: TimingStint[];
}

interface TimingAppDataResponse {
	Lines: Record<string, TimingAppLine>;
}

interface PitLaneTimeRecord {
	Duration?: string;
	Lap?: string;
	RacingNumber?: string;
}

interface PitLaneTimeCollectionResponse {
	PitTimes: Record<string, PitLaneTimeRecord>;
}

interface TimingDataLine {
	RacingNumber: string;
	Line: number;
	InPit?: boolean;
	PitOut?: boolean;
	NumberOfPitStops?: number | string;
}

interface TimingDataResponse {
	Lines: Record<string, TimingDataLine>;
}

interface LiveTimingSnapshot {
	RaceControlMessages?: RaceControlMessagesResponse;
	SessionInfo?: CurrentSessionInfo;
	WeatherData?: WeatherData;
	DriverList?: Record<string, SessionDriver>;
	TimingAppData?: TimingAppDataResponse;
	TimingDataF1?: TimingDataResponse;
	PitStopSeries?: PitStopSeriesResponse;
	PitLaneTimeCollection?: PitLaneTimeCollectionResponse;
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

function parseNumber(value: number | string | undefined): number | undefined {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : undefined;
	}

	if (typeof value !== "string" || value.length === 0) {
		return undefined;
	}

	const parsed = Number.parseFloat(value);
	return Number.isNaN(parsed) ? undefined : parsed;
}

function isTruthyFlag(value: boolean | string | undefined): boolean {
	return value === true || value === "true" || value === "1";
}

function buildDriverMap(driverList: Record<string, SessionDriver>): Map<string, string> {
	return new Map(Object.values(driverList).map((driver) => [driver.RacingNumber, driver.Tla]));
}

function formatTimedPitStops(
	title: string,
	driverMap: Map<string, string>,
	stops: PitStopRecord[],
	label = "Pit Stops",
): string {
	const summary = stops
		.map((stop) => {
			const driver = driverMap.get(stop.RacingNumber) || stop.RacingNumber;
			return `${driver} ${stop.PitStopTime}s (L${stop.Lap})`;
		})
		.join(" | ");

	return `🔧 \x02${title} ${label}\x02: ${summary}`;
}

function extractPitStopSeriesStops(series: PitStopSeriesResponse | undefined): PitStopRecord[] {
	if (!series) {
		return [];
	}

	return Object.values(series.PitTimes)
		.flatMap((bucket) => (Array.isArray(bucket) ? bucket : Object.values(bucket)))
		.map((entry) => entry.PitStop)
		.filter((stop) => parseNumber(stop.PitStopTime) !== undefined)
		.sort(
			(left, right) =>
				(parseNumber(left.PitStopTime) ?? Number.POSITIVE_INFINITY) -
				(parseNumber(right.PitStopTime) ?? Number.POSITIVE_INFINITY),
		)
		.slice(0, 5);
}

function extractPitLaneTimeStops(
	collection: PitLaneTimeCollectionResponse | undefined,
): PitStopRecord[] {
	if (!collection) {
		return [];
	}

	return Object.entries(collection.PitTimes)
		.map(([racingNumber, pitTime]) => ({
			RacingNumber: pitTime.RacingNumber || racingNumber,
			PitStopTime: pitTime.Duration || "",
			Lap: pitTime.Lap || "?",
		}))
		.filter((stop) => parseNumber(stop.PitStopTime) !== undefined)
		.sort(
			(left, right) =>
				(parseNumber(left.PitStopTime) ?? Number.POSITIVE_INFINITY) -
				(parseNumber(right.PitStopTime) ?? Number.POSITIVE_INFINITY),
		)
		.slice(0, 5);
}

function buildLiveRacePitSummary(snapshot: LiveTimingSnapshot, title: string): string | undefined {
	if (!snapshot.DriverList || !snapshot.TimingAppData || !snapshot.TimingDataF1) {
		return undefined;
	}

	const driverMap = buildDriverMap(snapshot.DriverList);
	const entries = Object.values(snapshot.TimingDataF1.Lines)
		.map((line) => {
			const pitStopCount = parseNumber(line.NumberOfPitStops);
			if (!pitStopCount || pitStopCount < 1) {
				return null;
			}

			const stints = snapshot.TimingAppData?.Lines[line.RacingNumber]?.Stints || [];
			const latestStint = stints.at(-1);
			const previousStint = stints.at(-2);
			const completedStops = Math.max(stints.length - 1, 0);
			const driver = driverMap.get(line.RacingNumber) || line.RacingNumber;

			if (line.InPit || line.PitOut) {
				return {
					sortGroup: 0,
					sortLine: line.Line,
					sortLap: Number.POSITIVE_INFINITY,
					text: `${driver} IN PIT (#${pitStopCount})`,
				};
			}

			if (completedStops < 1 || !latestStint) {
				return null;
			}

			const pitLap = parseNumber(latestStint.StartLaps);
			const transition =
				previousStint && latestStint.Compound
					? ` ${previousStint.Compound.toLowerCase()}>${latestStint.Compound.toLowerCase()}`
					: latestStint.Compound
						? ` ${latestStint.Compound.toLowerCase()}`
						: "";
			const noChange = isTruthyFlag(latestStint.TyresNotChanged) ? ",nochg" : "";

			return {
				sortGroup: 1,
				sortLine: line.Line,
				sortLap: pitLap ?? -1,
				text: `${driver} #${completedStops}${pitLap !== undefined ? ` L${pitLap}` : ""}${transition}${noChange}`,
			};
		})
		.filter(
			(entry): entry is { sortGroup: number; sortLine: number; sortLap: number; text: string } =>
				entry !== null,
		)
		.sort((left, right) => {
			if (left.sortGroup !== right.sortGroup) {
				return left.sortGroup - right.sortGroup;
			}

			if (left.sortGroup === 0) {
				return left.sortLine - right.sortLine;
			}

			if (left.sortLap !== right.sortLap) {
				return right.sortLap - left.sortLap;
			}

			return left.sortLine - right.sortLine;
		})
		.slice(0, 5);

	if (entries.length === 0) {
		return `No pit stops recorded for ${title}.`;
	}

	return `🔧 \x02${title} Pit Stops\x02: Live feed hides exact times; ${entries.map((entry) => entry.text).join(" | ")}`;
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

export async function fetchSessionPitStops(
	createConnection: () => LiveTimingConnection = createLiveTimingConnection,
): Promise<string> {
	const snapshot = await fetchCurrentSessionSnapshot(
		["DriverList", "PitStopSeries", "PitLaneTimeCollection", "TimingAppData", "TimingDataF1"],
		createConnection,
	);
	if (!snapshot.SessionInfo) {
		throw new Error("Live timing snapshot missing SessionInfo");
	}

	const session = snapshot.SessionInfo;
	const title = formatSessionTitle(session);
	const driverMap = snapshot.DriverList
		? buildDriverMap(snapshot.DriverList)
		: new Map<string, string>();
	const timedStops = extractPitStopSeriesStops(snapshot.PitStopSeries);
	if (timedStops.length > 0) {
		return formatTimedPitStops(title, driverMap, timedStops);
	}

	const pitLaneTimeStops = extractPitLaneTimeStops(snapshot.PitLaneTimeCollection);
	if (pitLaneTimeStops.length > 0) {
		return formatTimedPitStops(title, driverMap, pitLaneTimeStops, "Pit Lane Times");
	}

	if (session.Type === "Race" || session.Name === "Race") {
		const liveSummary = buildLiveRacePitSummary(snapshot, title);
		if (liveSummary) {
			return liveSummary;
		}
	}

	return `Pit stop data not available for ${title}.`;
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
